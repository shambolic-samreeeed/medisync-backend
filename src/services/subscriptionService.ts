/**
 * @file src/services/subscriptionService.ts
 * @description
 * Central service for all subscription lifecycle operations.
 * Controllers should call these methods rather than touching models directly.
 */
import Pharmacy from "../models/Pharmacy";
import Subscription, { SubscriptionStatus } from "../models/Subscription";
import SubscriptionPlan, { PlanTier } from "../models/SubscriptionPlan";
import PaymentRecord from "../models/PaymentRecord";

/**
 * Seed default plan definitions if they don't exist.
 * Call once at app startup.
 */
export async function seedDefaultPlans(): Promise<void> {
  const existingCount = await SubscriptionPlan.countDocuments();
  if (existingCount >= 3) return;

  await SubscriptionPlan.deleteMany({}); // clean slate

  await SubscriptionPlan.insertMany([
    {
      tier: "STARTER",
      name: "Starter",
      description: "Essential tools for a single-pharmacist pharmacy.",
      priceMonthly: 999,
      priceYearly: 9990,
      trialDays: 14,
      features: {
        inventoryManagement: true,
        basicPOS: true,
        digitalReceipts: true,
        clinicModule: false,
        expiryAlerts: false,
        analyticsBasic: false,
        analyticsAdvanced: false,
        multiBranch: false,
        auditLogs: false,
        apiAccess: false,
        prioritySupport: false,
        maxStaffAccounts: 1,
      },
    },
    {
      tier: "PROFESSIONAL",
      name: "Professional",
      description: "For growing pharmacies with clinic integration and analytics.",
      priceMonthly: 2499,
      priceYearly: 24990,
      trialDays: 14,
      features: {
        inventoryManagement: true,
        basicPOS: true,
        digitalReceipts: true,
        clinicModule: true,
        expiryAlerts: true,
        analyticsBasic: true,
        analyticsAdvanced: false,
        multiBranch: false,
        auditLogs: false,
        apiAccess: false,
        prioritySupport: false,
        maxStaffAccounts: 5,
      },
    },
    {
      tier: "ENTERPRISE",
      name: "Enterprise",
      description: "Full-featured multi-branch pharmacy management.",
      priceMonthly: 5999,
      priceYearly: 59990,
      trialDays: 14,
      features: {
        inventoryManagement: true,
        basicPOS: true,
        digitalReceipts: true,
        clinicModule: true,
        expiryAlerts: true,
        analyticsBasic: true,
        analyticsAdvanced: true,
        multiBranch: true,
        auditLogs: true,
        apiAccess: true,
        prioritySupport: true,
        maxStaffAccounts: -1, // unlimited
      },
    },
  ]);

  console.log("✅ [SubscriptionService] Default plans seeded.");
}

/**
 * Create a trial subscription for a newly created pharmacy.
 */
export async function createTrialSubscription(
  pharmacyId: string,
  tier: PlanTier = "STARTER"
): Promise<void> {
  const plan = await SubscriptionPlan.findOne({ tier });
  const trialDays = plan?.trialDays ?? 14;

  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + trialDays);

  await Subscription.create({
    pharmacyId,
    planTier: tier,
    status: "TRIAL",
    isTrial: true,
    trialStartDate: now,
    trialEndDate: trialEnd,
    startDate: now,
    endDate: trialEnd,
    paymentStatus: "UNPAID",
    amountPaid: 0,
  });

  await Pharmacy.findByIdAndUpdate(pharmacyId, {
    plan: tier,
    subscriptionStatus: "TRIAL",
    planEndDate: trialEnd,
    status: "ACTIVE",
  });
}

/**
 * Activate or renew a subscription after payment confirmation.
 */
export async function activateSubscription(
  pharmacyId: string,
  tier: PlanTier,
  months: number,
  paymentMethod: string,
  amountPaid: number,
  paymentReference?: string
): Promise<void> {
  const plan = await SubscriptionPlan.findOne({ tier });
  if (!plan) throw new Error(`Plan ${tier} not found`);

  // Find existing subscription or create new
  let subscription = await Subscription.findOne({ pharmacyId }).sort({ createdAt: -1 });

  const now = new Date();
  const baseDate = subscription?.endDate && subscription.endDate > now
    ? subscription.endDate  // extend from existing end date
    : now;

  const newEnd = new Date(baseDate);
  newEnd.setMonth(newEnd.getMonth() + months);

  if (subscription) {
    subscription.planTier = tier;
    subscription.status = "ACTIVE";
    subscription.isTrial = false;
    subscription.startDate = now;
    subscription.endDate = newEnd;
    subscription.renewedAt = now;
    subscription.paymentStatus = "PAID";
    subscription.amountPaid = amountPaid;
    subscription.paymentMethod = paymentMethod;
    subscription.paymentReference = paymentReference;
    await subscription.save();
  } else {
    subscription = await Subscription.create({
      pharmacyId,
      planTier: tier,
      status: "ACTIVE",
      isTrial: false,
      startDate: now,
      endDate: newEnd,
      paymentStatus: "PAID",
      amountPaid,
      paymentMethod,
      paymentReference,
    });
  }

  // Record payment
  await PaymentRecord.create({
    pharmacyId,
    subscriptionId: subscription._id,
    gateway: paymentMethod,
    status: "COMPLETED",
    amount: amountPaid,
    currency: "NPR",
    gatewayTransactionId: paymentReference,
    description: `${tier} plan - ${months} month(s)`,
    paidAt: now,
  });

  // Sync pharmacy snapshot
  await Pharmacy.findByIdAndUpdate(pharmacyId, {
    plan: tier,
    subscriptionStatus: "ACTIVE",
    planEndDate: newEnd,
    status: "ACTIVE",
  });
}

/**
 * Suspend a pharmacy subscription.
 */
export async function suspendSubscription(pharmacyId: string): Promise<void> {
  await Subscription.updateMany(
    { pharmacyId, status: { $in: ["TRIAL", "ACTIVE"] } },
    { status: "SUSPENDED", suspendedAt: new Date() }
  );
  await Pharmacy.findByIdAndUpdate(pharmacyId, {
    subscriptionStatus: "SUSPENDED",
    status: "SUSPENDED",
  });
}

/**
 * Cancel a pharmacy subscription.
 */
export async function cancelSubscription(pharmacyId: string): Promise<void> {
  await Subscription.updateMany(
    { pharmacyId, status: { $in: ["TRIAL", "ACTIVE", "SUSPENDED"] } },
    { status: "CANCELLED", cancelledAt: new Date() }
  );
  await Pharmacy.findByIdAndUpdate(pharmacyId, {
    subscriptionStatus: "CANCELLED",
    status: "CANCELLED",
  });
}

/**
 * Reactivate a suspended subscription.
 */
export async function reactivateSubscription(pharmacyId: string): Promise<void> {
  const sub = await Subscription.findOne({
    pharmacyId,
    status: "SUSPENDED",
  }).sort({ createdAt: -1 });

  if (sub) {
    // Only reactivate if not expired
    const now = new Date();
    if (sub.endDate > now) {
      sub.status = "ACTIVE";
      sub.suspendedAt = undefined;
      await sub.save();
    }
  }

  await Pharmacy.findByIdAndUpdate(pharmacyId, {
    subscriptionStatus: "ACTIVE",
    status: "ACTIVE",
  });
}

/**
 * Get the current active subscription for a pharmacy with plan details.
 */
export async function getPharmacySubscription(pharmacyId: string) {
  const subscription = await Subscription.findOne({
    pharmacyId,
    status: { $in: ["TRIAL", "ACTIVE"] },
  }).sort({ createdAt: -1 });

  if (!subscription) return null;

  const plan = await SubscriptionPlan.findOne({ tier: subscription.planTier });
  return { subscription, plan };
}

/**
 * Daily cron task: expire subscriptions past their endDate.
 */
export async function runExpiryCheck(): Promise<number> {
  const now = new Date();

  const result = await Subscription.updateMany(
    {
      endDate: { $lt: now },
      status: { $in: ["TRIAL", "ACTIVE"] },
    },
    { $set: { status: "EXPIRED" } }
  );

  // Sync pharmacy status
  if (result.modifiedCount > 0) {
    const expiredSubs = await Subscription.find({
      endDate: { $lt: now },
      status: "EXPIRED",
    }).select("pharmacyId");

    const pharmacyIds = expiredSubs.map((s) => s.pharmacyId);

    await Pharmacy.updateMany(
      { _id: { $in: pharmacyIds } },
      { subscriptionStatus: "EXPIRED", status: "SUSPENDED" }
    );
  }

  return result.modifiedCount;
}
