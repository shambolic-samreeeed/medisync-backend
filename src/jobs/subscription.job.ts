/**
 * @file src/jobs/subscription.job.ts
 * @description
 * Subscription status check — runs once per day at midnight.
 * FIXED: was "* * * * *" (every minute). Now "0 0 * * *" (daily at midnight).
 * Uses a single bulk updateMany instead of looping + calling save() on each pharmacy.
 */
import cron from "node-cron";
import Pharmacy from "../models/Pharmacy";

export const startSubscriptionJob = () => {
  // ✅ FIXED: Daily at midnight — was "* * * * *" (ran every minute, hammering DB)
  cron.schedule("0 0 * * *", async () => {
    console.log("🔄 [SubscriptionJob] Running daily subscription check...");

    try {
      const result = await Pharmacy.updateMany(
        {
          planEndDate: { $lt: new Date() },
          paymentStatus: { $ne: "OVERDUE" },
        },
        {
          $set: {
            paymentStatus: "OVERDUE",
            status: "SUSPENDED",
          },
        }
      );

      console.log(
        `✅ [SubscriptionJob] Suspended ${result.modifiedCount} expired pharmacies.`
      );
    } catch (err) {
      console.error("❌ [SubscriptionJob] Subscription job error:", err);
    }
  });

  console.log("✅ Subscription cron job registered (daily at midnight).");
};