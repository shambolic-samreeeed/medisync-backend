/**
 * @file src/middlewares/featureGuard.ts
 * @description
 * Feature-gating middleware for subscription plan enforcement.
 *
 * Usage:
 *   router.get("/analytics", authMiddleware, requireFeature("analyticsBasic"), handler);
 *   router.post("/staff", authMiddleware, requireFeature("staffLimit"), handler);
 */
import { Request, Response, NextFunction } from "express";
import SubscriptionPlan, { IPlanFeatures } from "../models/SubscriptionPlan";
import Subscription from "../models/Subscription";
import { User } from "../models/User";

// The boolean feature keys (not maxStaffAccounts)
type BooleanFeatureKey = {
  [K in keyof IPlanFeatures]: IPlanFeatures[K] extends boolean ? K : never;
}[keyof IPlanFeatures];

/**
 * requireFeature(featureKey)
 * Checks that the pharmacy's active subscription plan includes the given feature.
 * Admins (super-admin) bypass feature checks.
 */
export const requireFeature = (featureKey: BooleanFeatureKey) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      // Super-admin bypasses all feature gates
      if (!user || user.role === "ADMIN") return next();

      const pharmacyId = user.pharmacyId;
      if (!pharmacyId) {
        return res.status(403).json({
          success: false,
          message: "No pharmacy assigned to this user.",
        });
      }

      // Find the active subscription
      const subscription = await Subscription.findOne({
        pharmacyId,
        status: { $in: ["TRIAL", "ACTIVE"] },
      });

      if (!subscription) {
        return res.status(403).json({
          success: false,
          featureLocked: true,
          message: "No active subscription found. Please renew to access this feature.",
        });
      }

      // Load the plan definition
      const plan = await SubscriptionPlan.findOne({ tier: subscription.planTier });
      if (!plan) {
        return res.status(403).json({
          success: false,
          message: "Subscription plan configuration not found.",
        });
      }

      if (!plan.features[featureKey]) {
        return res.status(403).json({
          success: false,
          featureLocked: true,
          requiredFeature: featureKey,
          currentPlan: subscription.planTier,
          message: `This feature (${featureKey}) is not available on your ${subscription.planTier} plan. Please upgrade to access it.`,
        });
      }

      next();
    } catch (err) {
      return res.status(500).json({ success: false, message: "Feature check failed." });
    }
  };
};

/**
 * enforceStaffLimit
 * Checks that the pharmacy has not exceeded its plan's maxStaffAccounts limit.
 * Call this before creating a new staff/pharmacist user.
 */
export const enforceStaffLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user;
    if (!user || user.role === "ADMIN") return next();

    const pharmacyId = user.pharmacyId;
    if (!pharmacyId) return next();

    const subscription = await Subscription.findOne({
      pharmacyId,
      status: { $in: ["TRIAL", "ACTIVE"] },
    });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: "No active subscription. Cannot add staff.",
      });
    }

    const plan = await SubscriptionPlan.findOne({ tier: subscription.planTier });
    if (!plan) return next();

    const maxStaff = plan.features.maxStaffAccounts;
    if (maxStaff === -1) return next(); // unlimited

    // Count current PHARMACIST users for this pharmacy
    const currentStaffCount = await User.countDocuments({
      pharmacyId,
      role: "PHARMACIST",
    });

    if (currentStaffCount >= maxStaff) {
      return res.status(403).json({
        success: false,
        featureLocked: true,
        message: `Your ${subscription.planTier} plan allows a maximum of ${maxStaff} staff account(s). Please upgrade to add more staff.`,
        currentCount: currentStaffCount,
        maxAllowed: maxStaff,
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: "Staff limit check failed." });
  }
};
