/**
 * @file src/controller/superAdminController.ts
 * @description
 * All super-admin operations: dashboard stats, pharmacy management,
 * user management, subscription management, plan management.
 */
import { Request, Response } from "express";
import mongoose from "mongoose";
import Pharmacy from "../models/Pharmacy";
import { User } from "../models/User";
import Subscription from "../models/Subscription";
import SubscriptionPlan, { PlanTier } from "../models/SubscriptionPlan";
import PaymentRecord from "../models/PaymentRecord";
import {
  activateSubscription,
  cancelSubscription,
  createTrialSubscription,
  reactivateSubscription,
  suspendSubscription,
} from "../services/subscriptionService";

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/dashboard
 * Overview stats for the super-admin dashboard.
 */
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const [
      totalPharmacies,
      activePharmacies,
      suspendedPharmacies,
      totalUsers,
      totalRevenue,
      activeSubs,
      expiredSubs,
      trialSubs,
      planBreakdown,
    ] = await Promise.all([
      Pharmacy.countDocuments(),
      Pharmacy.countDocuments({ status: "ACTIVE" }),
      Pharmacy.countDocuments({ status: "SUSPENDED" }),
      User.countDocuments({ role: "PHARMACIST" }),
      PaymentRecord.aggregate([
        { $match: { status: "COMPLETED" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Subscription.countDocuments({ status: "ACTIVE" }),
      Subscription.countDocuments({ status: { $in: ["EXPIRED", "CANCELLED"] } }),
      Subscription.countDocuments({ status: "TRIAL" }),
      Subscription.aggregate([
        { $group: { _id: "$planTier", count: { $sum: 1 } } },
      ]),
    ]);

    // Recent payment records
    const recentPayments = await PaymentRecord.find({ status: "COMPLETED" })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("pharmacyId", "name");

    // Pharmacies expiring in next 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const expiringPharmacies = await Subscription.find({
      status: { $in: ["ACTIVE", "TRIAL"] },
      endDate: { $lte: sevenDaysFromNow, $gte: new Date() },
    })
      .populate("pharmacyId", "name email")
      .sort({ endDate: 1 })
      .limit(10);

    return res.json({
      success: true,
      data: {
        overview: {
          totalPharmacies,
          activePharmacies,
          suspendedPharmacies,
          cancelledPharmacies: totalPharmacies - activePharmacies - suspendedPharmacies,
          totalStaffUsers: totalUsers,
          totalRevenue: totalRevenue[0]?.total ?? 0,
        },
        subscriptions: {
          active: activeSubs,
          trial: trialSubs,
          expiredOrCancelled: expiredSubs,
          byPlan: Object.fromEntries(
            planBreakdown.map((p) => [p._id, p.count])
          ),
        },
        recentPayments,
        expiringPharmacies,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PHARMACY MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/pharmacies
 * List all pharmacies with pagination, search, and filter.
 */
export const listPharmacies = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.plan) filter.plan = req.query.plan;
    if (req.query.q) {
      filter.$or = [
        { name: { $regex: req.query.q, $options: "i" } },
        { email: { $regex: req.query.q, $options: "i" } },
      ];
    }

    const [total, pharmacies] = await Promise.all([
      Pharmacy.countDocuments(filter),
      Pharmacy.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("ownerId", "firstName lastName email"),
    ]);

    // Attach subscription for each pharmacy
    const pharmacyIds = pharmacies.map((p) => p._id);
    const subscriptions = await Subscription.find({
      pharmacyId: { $in: pharmacyIds },
      status: { $in: ["TRIAL", "ACTIVE", "SUSPENDED"] },
    });
    const subMap = Object.fromEntries(
      subscriptions.map((s) => [s.pharmacyId.toString(), s])
    );

    const enriched = pharmacies.map((p) => ({
      ...p.toObject(),
      subscription: subMap[p._id.toString()] ?? null,
    }));

    return res.json({
      success: true,
      data: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * GET /api/admin/pharmacies/:id
 * Get full pharmacy details including staff and subscription history.
 */
export const getPharmacyDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid pharmacy ID" });
    }

    const [pharmacy, staff, subscriptionHistory, paymentHistory] = await Promise.all([
      Pharmacy.findById(id).populate("ownerId", "firstName lastName email"),
      User.find({ pharmacyId: id, role: { $in: ["PHARMACIST", "DOCTOR"] } }).select("-password"),
      Subscription.find({ pharmacyId: id }).sort({ createdAt: -1 }),
      PaymentRecord.find({ pharmacyId: id }).sort({ createdAt: -1 }).limit(20),
    ]);

    if (!pharmacy) {
      return res.status(404).json({ success: false, message: "Pharmacy not found" });
    }

    return res.json({
      success: true,
      data: {
        pharmacy,
        staff,
        subscriptionHistory,
        paymentHistory,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * POST /api/admin/pharmacies
 * Create pharmacy and automatically provision a trial subscription.
 */
export const adminCreatePharmacy = async (req: Request, res: Response) => {
  try {
    const { name, address, phone, email, licenseNumber, plan } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "Pharmacy name is required" });
    }

    const existing = await Pharmacy.findOne({ name });
    if (existing) {
      return res.status(409).json({ success: false, message: "Pharmacy name already exists" });
    }

    const tier: PlanTier = plan ?? "STARTER";
    const pharmacy = await Pharmacy.create({
      name,
      address,
      phone,
      email,
      licenseNumber,
      plan: tier,
      status: "ACTIVE",
      subscriptionStatus: "TRIAL",
    });

    // Auto-provision trial subscription
    await createTrialSubscription(pharmacy._id.toString(), tier);

    return res.status(201).json({
      success: true,
      message: "Pharmacy created with trial subscription",
      data: pharmacy,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};

/**
 * PUT /api/admin/pharmacies/:id/suspend
 * Suspend a pharmacy.
 */
export const suspendPharmacy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await suspendSubscription(id);
    const pharmacy = await Pharmacy.findById(id);
    return res.json({ success: true, message: "Pharmacy suspended", data: pharmacy });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * PUT /api/admin/pharmacies/:id/reactivate
 * Reactivate a suspended pharmacy.
 */
export const reactivatePharmacy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await reactivateSubscription(id);
    const pharmacy = await Pharmacy.findById(id);
    return res.json({ success: true, message: "Pharmacy reactivated", data: pharmacy });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * PUT /api/admin/pharmacies/:id/cancel
 * Cancel a pharmacy subscription.
 */
export const cancelPharmacy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await cancelSubscription(id);
    const pharmacy = await Pharmacy.findById(id);
    return res.json({ success: true, message: "Pharmacy subscription cancelled", data: pharmacy });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/pharmacies/:id/subscription/activate
 * Activate or upgrade subscription with manual payment recording.
 * Body: { tier, months, amountPaid, paymentMethod, paymentReference }
 */
export const adminActivateSubscription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      tier,
      months = 1,
      amountPaid = 0,
      paymentMethod = "MANUAL",
      paymentReference,
    } = req.body;

    if (!["STARTER", "PROFESSIONAL", "ENTERPRISE"].includes(tier)) {
      return res.status(400).json({ success: false, message: "Invalid plan tier" });
    }

    await activateSubscription(
      id,
      tier as PlanTier,
      months,
      paymentMethod,
      amountPaid,
      paymentReference
    );

    const subscription = await Subscription.findOne({
      pharmacyId: id,
      status: "ACTIVE",
    });

    return res.json({
      success: true,
      message: "Subscription activated successfully",
      data: subscription,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};

/**
 * GET /api/admin/pharmacies/:id/subscription
 * Get subscription details for a pharmacy.
 */
export const getPharmacySubscriptionAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [subscriptions, payments] = await Promise.all([
      Subscription.find({ pharmacyId: id }).sort({ createdAt: -1 }),
      PaymentRecord.find({ pharmacyId: id }).sort({ createdAt: -1 }),
    ]);
    return res.json({ success: true, data: { subscriptions, payments } });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * List all staff users, optionally filtered by pharmacyId.
 */
export const listUsers = async (req: Request, res: Response) => {
  try {
    const { pharmacyId, role, q } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter: any = { role: { $ne: "ADMIN" } };
    if (pharmacyId) filter.pharmacyId = pharmacyId;
    if (role) filter.role = String(role).toUpperCase();
    if (q) {
      filter.$or = [
        { firstName: { $regex: q, $options: "i" } },
        { lastName: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("-password")
        .populate("pharmacyId", "name status plan")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    return res.json({
      success: true,
      data: users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * DELETE /api/admin/users/:userId
 * Delete any non-admin user.
 */
export const adminDeleteUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await User.findOneAndDelete({ userId, role: { $ne: "ADMIN" } });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, message: "User deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PLAN MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/plans
 * List all subscription plans.
 */
export const listPlans = async (_req: Request, res: Response) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ priceMonthly: 1 });
    return res.json({ success: true, data: plans });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * PUT /api/admin/plans/:tier
 * Update a plan's pricing or features.
 */
export const updatePlan = async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;
    const updates = req.body;

    const plan = await SubscriptionPlan.findOneAndUpdate(
      { tier: tier.toUpperCase() },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    return res.json({ success: true, message: "Plan updated", data: plan });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/revenue
 * Revenue summary and history.
 */
export const getRevenue = async (req: Request, res: Response) => {
  try {
    const [totalRevenue, monthlyBreakdown, recentPayments] = await Promise.all([
      PaymentRecord.aggregate([
        { $match: { status: "COMPLETED" } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      PaymentRecord.aggregate([
        { $match: { status: "COMPLETED" } },
        {
          $group: {
            _id: {
              year: { $year: "$paidAt" },
              month: { $month: "$paidAt" },
            },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": -1, "_id.month": -1 } },
        { $limit: 12 },
      ]),
      PaymentRecord.find({ status: "COMPLETED" })
        .sort({ paidAt: -1 })
        .limit(20)
        .populate("pharmacyId", "name"),
    ]);

    return res.json({
      success: true,
      data: {
        totalRevenue: totalRevenue[0]?.total ?? 0,
        totalTransactions: totalRevenue[0]?.count ?? 0,
        monthlyBreakdown,
        recentPayments,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
