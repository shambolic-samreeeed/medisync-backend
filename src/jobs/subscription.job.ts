import cron from "node-cron";
import Pharmacy from "../models/Pharmacy";

export const startSubscriptionJob = () => {
  // Runs every day at midnight
//   cron.schedule("0 0 * * *", async () => {
cron.schedule("* * * * *", async () => {
    console.log("🔄 Running subscription status check...");

    const now = new Date();

    try {
      // Find expired pharmacies
      const expiredPharmacies = await Pharmacy.find({
        planEndDate: { $lt: now },
        paymentStatus: { $ne: "OVERDUE" },
      });
      console.log("🔄 Running subscription check...");
console.log("Server time:", new Date());

      for (const pharmacy of expiredPharmacies) {
        pharmacy.paymentStatus = "OVERDUE";
        pharmacy.status = "SUSPENDED"; // or INACTIVE depending on your logic
        await pharmacy.save();
        console.log("Updating pharmacy:", pharmacy.name);
      }

      console.log(`✅ Updated ${expiredPharmacies.length} expired pharmacies`);
    } catch (err) {
      console.error(" Subscription job error:", err);
    }
  });
};