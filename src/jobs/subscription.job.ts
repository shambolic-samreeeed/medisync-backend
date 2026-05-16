/**
 * @file src/jobs/subscription.job.ts
 * @description Daily cron job to expire subscriptions past their end date.
 * Delegates business logic to subscriptionService — no model access here.
 */
import cron from "node-cron";
import { runExpiryCheck } from "../services/subscriptionService";

export const startSubscriptionJob = () => {
  // Runs daily at midnight
  cron.schedule("0 0 * * *", async () => {
    console.log("🔄 [SubscriptionJob] Running daily subscription expiry check...");
    try {
      const count = await runExpiryCheck();
      console.log(`✅ [SubscriptionJob] Expired ${count} subscription(s).`);
    } catch (err) {
      console.error(" [SubscriptionJob] Error:", err);
    }
  });

  console.log(" Subscription cron job registered (daily at midnight).");
};
