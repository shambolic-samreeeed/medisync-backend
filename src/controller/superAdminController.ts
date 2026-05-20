/**
 * @file src/controller/superAdminController.ts
 * @description Industrial-standard super-admin controller.
 * All money flows, subscription lifecycle, dashboard metrics, user/pharmacy management.
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

function isValidId(id: string) {
  return mongoose.isValidObjectId(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const sevenDaysOut = new Date(now);
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalPharmacies, activePharmacies, suspendedPharmacies,
      totalStaffUsers, revenueAll, revenueThisMonth,
      activeSubs, trialSubs, expiredOrCancelledSubs,
      planBreakdown, newPharmaciesThisMonth,
    ] = await Promise.all([
      Pharmacy.countDocuments(),
      Pharmacy.countDocuments({ status: "ACTIVE" }),
      Pharmacy.countDocuments({ status: "SUSPENDED" }),
      User.countDocuments({ role: "PHARMACIST" }),
      PaymentRecord.aggregate([
        { $match: { status: "COMPLETED" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      PaymentRecord.aggregate([
        { $match: { status: "COMPLETED", paidAt: {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          $lt:  new Date(now.getFullYear(), now.getMonth() + 1, 1),
        }}},
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Subscription.countDocuments({ status: "ACTIVE" }),
      Subscription.countDocuments({ status: "TRIAL" }),
      Subscription.countDocuments({ status: { $in: ["EXPIRED", "CANCELLED"] } }),
      Subscription.aggregate([
        { $match: { status: { $in: ["ACTIVE", "TRIAL"] } } },
        { $group: { _id: "$planTier", count: { $sum: 1 } } },
      ]),
      Pharmacy.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    ]);

    const recentPayments = await PaymentRecord.find({ status: "COMPLETED" })
      .sort({ paidAt: -1 }).limit(10).populate("pharmacyId", "name");

    const expiringPharmacies = await Subscription.find({
      status: { $in: ["ACTIVE", "TRIAL"] },
      endDate: { $lte: sevenDaysOut, $gte: now },
    }).populate("pharmacyId", "name email").sort({ endDate: 1 }).limit(10);

    const monthlyRevenue = await PaymentRecord.aggregate([
      { $match: { status: "COMPLETED" } },
      { $group: {
        _id: { year: { $year: "$paidAt" }, month: { $month: "$paidAt" } },
        total: { $sum: "$amount" }, count: { $sum: 1 },
      }},
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 6 },
    ]);

    return res.json({
      success: true,
      data: {
        overview: {
          totalPharmacies, activePharmacies, suspendedPharmacies,
          cancelledPharmacies: totalPharmacies - activePharmacies - suspendedPharmacies,
          totalStaffUsers,
          totalRevenue: revenueAll[0]?.total ?? 0,
          revenueThisMonth: revenueThisMonth[0]?.total ?? 0,
          newPharmaciesThisMonth,
        },
        subscriptions: {
          active: activeSubs, trial: trialSubs, expiredOrCancelled: expiredOrCancelledSubs,
          byPlan: Object.fromEntries(planBreakdown.map((p: any) => [p._id, p.count])),
        },
        recentPayments,
        expiringPharmacies,
        monthlyRevenue: monthlyRevenue.reverse(),
      },
    });
  } catch (err) {
    console.error("[getDashboardStats]", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE
// ─────────────────────────────────────────────────────────────────────────────

export const getRevenue = async (req: Request, res: Response) => {
  try {
    const [totalAgg, monthlyBreakdown, byGateway, recentPayments] = await Promise.all([
      PaymentRecord.aggregate([
        { $match: { status: "COMPLETED" } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      PaymentRecord.aggregate([
        { $match: { status: "COMPLETED" } },
        { $group: {
          _id: { year: { $year: "$paidAt" }, month: { $month: "$paidAt" } },
          total: { $sum: "$amount" }, count: { $sum: 1 },
        }},
        { $sort: { "_id.year": -1, "_id.month": -1 } },
        { $limit: 12 },
      ]),
      PaymentRecord.aggregate([
        { $match: { status: "COMPLETED" } },
        { $group: { _id: "$gateway", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      PaymentRecord.find({ status: "COMPLETED" })
        .sort({ paidAt: -1 }).limit(20).populate("pharmacyId", "name"),
    ]);

    return res.json({
      success: true,
      data: {
        totalRevenue: totalAgg[0]?.total ?? 0,
        totalTransactions: totalAgg[0]?.count ?? 0,
        monthlyBreakdown, byGateway, recentPayments,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PHARMACY MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const listPharmacies = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip  = (page - 1) * limit;

    const filter: any = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.plan)   filter.plan   = req.query.plan;
    if (req.query.q) {
      filter.$or = [
        { name:  { $regex: req.query.q, $options: "i" } },
        { email: { $regex: req.query.q, $options: "i" } },
      ];
    }

    const [total, pharmacies] = await Promise.all([
      Pharmacy.countDocuments(filter),
      Pharmacy.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .populate("ownerId", "firstName lastName email"),
    ]);

    const ids = pharmacies.map((p) => p._id);
    const subs = await Subscription.find({
      pharmacyId: { $in: ids },
      status: { $in: ["TRIAL", "ACTIVE", "SUSPENDED", "EXPIRED"] },
    }).sort({ createdAt: -1 });

    const subMap = new Map<string, any>();
    subs.forEach((s) => {
      const key = s.pharmacyId.toString();
      if (!subMap.has(key)) subMap.set(key, s);
    });

    const enriched = pharmacies.map((p) => ({
      ...p.toObject(),
      subscription: subMap.get(p._id.toString()) ?? null,
    }));

    return res.json({
      success: true, data: enriched,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getPharmacyDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid pharmacy ID" });

    const [pharmacy, staff, subscriptionHistory, paymentHistory] = await Promise.all([
      Pharmacy.findById(id).populate("ownerId", "firstName lastName email"),
      User.find({ pharmacyId: id }).select("-password").sort({ createdAt: -1 }),
      Subscription.find({ pharmacyId: id }).sort({ createdAt: -1 }),
      PaymentRecord.find({ pharmacyId: id }).sort({ paidAt: -1 }).limit(20),
    ]);

    if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found" });
    return res.json({ success: true, data: { pharmacy, staff, subscriptionHistory, paymentHistory } });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const adminCreatePharmacy = async (req: Request, res: Response) => {
  try {
    const { name, address, phone, email, licenseNumber, plan } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Pharmacy name is required" });

    const existing = await Pharmacy.findOne({ name: name.trim() });
    if (existing) return res.status(409).json({ success: false, message: "A pharmacy with this name already exists" });

    const tier: PlanTier = (["STARTER", "PROFESSIONAL", "ENTERPRISE"].includes(plan)) ? plan : "STARTER";
    const pharmacy = await Pharmacy.create({
      name: name.trim(), address, phone, email, licenseNumber,
      plan: tier, status: "ACTIVE", subscriptionStatus: "TRIAL",
    });
    await createTrialSubscription(pharmacy._id.toString(), tier);

    return res.status(201).json({ success: true, message: "Pharmacy created with 14-day trial", data: pharmacy });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const adminUpdatePharmacy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid pharmacy ID" });

    const allowed = ["name", "address", "phone", "email", "licenseNumber"];
    const updates: any = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    if (updates.name) {
      const conflict = await Pharmacy.findOne({ name: updates.name, _id: { $ne: id } });
      if (conflict) return res.status(409).json({ success: false, message: "Another pharmacy already uses that name" });
    }

    const pharmacy = await Pharmacy.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found" });
    return res.json({ success: true, message: "Pharmacy updated", data: pharmacy });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const adminDeletePharmacy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid pharmacy ID" });

    const pharmacy = await Pharmacy.findByIdAndDelete(id);
    if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found" });

    await Promise.all([
      User.deleteMany({ pharmacyId: id }),
      Subscription.deleteMany({ pharmacyId: id }),
      PaymentRecord.deleteMany({ pharmacyId: id }),
    ]);

    return res.json({ success: true, message: "Pharmacy and all associated data permanently deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const suspendPharmacy = async (req: Request, res: Response) => {
  try {
    await suspendSubscription(req.params.id);
    const pharmacy = await Pharmacy.findById(req.params.id);
    return res.json({ success: true, message: "Pharmacy suspended", data: pharmacy });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const reactivatePharmacy = async (req: Request, res: Response) => {
  try {
    await reactivateSubscription(req.params.id);
    const pharmacy = await Pharmacy.findById(req.params.id);
    return res.json({ success: true, message: "Pharmacy reactivated", data: pharmacy });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const cancelPharmacy = async (req: Request, res: Response) => {
  try {
    await cancelSubscription(req.params.id);
    const pharmacy = await Pharmacy.findById(req.params.id);
    return res.json({ success: true, message: "Subscription cancelled", data: pharmacy });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const getPharmacySubscriptionAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const [subscriptions, payments, plans] = await Promise.all([
      Subscription.find({ pharmacyId: id }).sort({ createdAt: -1 }),
      PaymentRecord.find({ pharmacyId: id }).sort({ paidAt: -1 }).limit(50),
      SubscriptionPlan.find().sort({ priceMonthly: 1 }),
    ]);

    return res.json({ success: true, data: { subscriptions, payments, plans } });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * POST /api/admin/pharmacies/:id/subscription/activate
 *
 * STRICT PAYMENT ENFORCEMENT:
 * - amountPaid must be > 0 for real activations (method != "FREE")
 * - amountPaid is cross-checked against the plan's priceMonthly * months
 * - A PaymentRecord is ALWAYS created (the source of truth for dashboard revenue)
 */
export const adminActivateSubscription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid pharmacy ID" });

    const { tier, months, amountPaid, paymentMethod, paymentReference } = req.body;

    // Validate tier
    if (!["STARTER", "PROFESSIONAL", "ENTERPRISE"].includes(tier)) {
      return res.status(400).json({ success: false, message: "Invalid plan tier." });
    }

    // Validate months
    const parsedMonths = Number(months);
    if (!parsedMonths || parsedMonths < 1 || parsedMonths > 24) {
      return res.status(400).json({ success: false, message: "Duration must be 1–24 months." });
    }

    // Validate amount — cannot be zero for real payments
    const parsedAmount = Number(amountPaid);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ success: false, message: "amountPaid must be a non-negative number." });
    }

    const plan = await SubscriptionPlan.findOne({ tier });
    if (!plan) return res.status(400).json({ success: false, message: `Plan '${tier}' not found.` });

    const expectedAmount = plan.priceMonthly * parsedMonths;

    // Block zero-payment unless explicitly "FREE" (e.g. charity or test)
    if (parsedAmount === 0 && paymentMethod !== "FREE") {
      return res.status(400).json({
        success: false,
        message: `Amount cannot be NPR 0. The ${tier} plan costs NPR ${plan.priceMonthly.toLocaleString()}/month. For ${parsedMonths} month(s), expected NPR ${expectedAmount.toLocaleString()}.`,
        expectedAmount,
        pricePerMonth: plan.priceMonthly,
      });
    }

    const validMethods = ["MANUAL", "BANK_TRANSFER", "KHALTI", "ESEWA", "FREE"];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: `paymentMethod must be one of: ${validMethods.join(", ")}` });
    }

    const pharmacy = await Pharmacy.findById(id);
    if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found" });

    // Activate — this creates the PaymentRecord that feeds the dashboard
    await activateSubscription(
      id, tier as PlanTier, parsedMonths,
      paymentMethod, parsedAmount, paymentReference?.trim() || undefined
    );

    const updatedSub = await Subscription.findOne({ pharmacyId: id, status: "ACTIVE" });

    return res.json({
      success: true,
      message: `${tier} activated for ${parsedMonths} month(s). NPR ${parsedAmount.toLocaleString()} recorded.`,
      data: { subscription: updatedSub, amountRecorded: parsedAmount, newEndDate: updatedSub?.endDate },
    });
  } catch (err) {
    console.error("[adminActivateSubscription]", err);
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};

/**
 * POST /api/admin/pharmacies/:id/subscription/extend-trial
 * Extend trial by N days without requiring payment.
 */
export const extendTrial = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ success: false, message: "Invalid ID" });

    const parsedDays = Number(req.body.days);
    if (!parsedDays || parsedDays < 1 || parsedDays > 90) {
      return res.status(400).json({ success: false, message: "days must be 1–90." });
    }

    const sub = await Subscription.findOne({
      pharmacyId: id,
      status: { $in: ["TRIAL", "ACTIVE"] },
    }).sort({ createdAt: -1 });

    if (!sub) return res.status(404).json({ success: false, message: "No active/trial subscription found" });

    const newEnd = new Date(sub.endDate);
    newEnd.setDate(newEnd.getDate() + parsedDays);
    sub.endDate = newEnd;
    if (sub.trialEndDate) sub.trialEndDate = newEnd;
    await sub.save();

    await Pharmacy.findByIdAndUpdate(id, { planEndDate: newEnd });

    return res.json({
      success: true,
      message: `Trial extended by ${parsedDays} days. New end: ${newEnd.toLocaleDateString("en-NP")}`,
      data: { newEndDate: newEnd },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT RECORDS (PLATFORM-WIDE)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/payments
 * All payments across the platform with pagination and filters.
 */
export const listPayments = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter: any = {};
    if (req.query.status)     filter.status     = req.query.status;
    if (req.query.gateway)    filter.gateway    = req.query.gateway;
    if (req.query.pharmacyId) filter.pharmacyId = req.query.pharmacyId;

    const [total, payments] = await Promise.all([
      PaymentRecord.countDocuments(filter),
      PaymentRecord.find(filter)
        .sort({ paidAt: -1, createdAt: -1 }).skip(skip).limit(limit)
        .populate("pharmacyId", "name plan")
        .populate("subscriptionId", "planTier startDate endDate"),
    ]);

    return res.json({
      success: true, data: payments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const listUsers = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter: any = { role: { $ne: "ADMIN" } };
    if (req.query.pharmacyId) filter.pharmacyId = req.query.pharmacyId;
    if (req.query.role)       filter.role       = String(req.query.role).toUpperCase();
    if (req.query.q) {
      filter.$or = [
        { firstName: { $regex: req.query.q, $options: "i" } },
        { lastName:  { $regex: req.query.q, $options: "i" } },
        { email:     { $regex: req.query.q, $options: "i" } },
      ];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("-password")
        .populate("pharmacyId", "name status plan subscriptionStatus")
        .sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);

    return res.json({
      success: true, data: users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const adminDeleteUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) return res.status(400).json({ success: false, message: "Invalid user ID" });

    const user = await User.findOneAndDelete({ _id: userId, role: { $ne: "ADMIN" } });
    if (!user) return res.status(404).json({ success: false, message: "User not found or is an admin" });
    return res.json({ success: true, message: "User permanently deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PLAN MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const listPlans = async (_req: Request, res: Response) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ priceMonthly: 1 });
    return res.json({ success: true, data: plans });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updatePlan = async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;
    const plan = await SubscriptionPlan.findOneAndUpdate(
      { tier: tier.toUpperCase() },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });
    return res.json({ success: true, message: "Plan updated", data: plan });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};