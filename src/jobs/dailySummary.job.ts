/**
 * @file src/jobs/dailySummary.job.ts
 * @description
 * Sends a daily sales summary email to every ACTIVE pharmacy at 8 PM Nepal time (20:00 Asia/Kathmandu).
 * Cron: "0 14 * * *" → 8 PM Nepal Standard Time (UTC+5:45 → 20:00 - 5:45 = 14:15 UTC, but cron doesn't handle minutes, so 0 14 is 7:45 PM UTC = 8:00 PM in NST rounded up)
 * NOTE: Nepal is UTC+5:45. 20:00 NST = 14:15 UTC. Since node-cron uses UTC, we use "15 14 * * *".
 */

import cron from "node-cron";
import Pharmacy from "../models/Pharmacy";
import Sale from "../models/Sale";
import { sendDailySalesSummaryEmail } from "../utils/emailService";
import { DateTime } from "luxon";

const NEPAL_TZ = "Asia/Kathmandu";

async function runDailySummary() {
  console.log("📊 [DailySummaryJob] Sending daily sales summaries...");

  const now = DateTime.now().setZone(NEPAL_TZ);
  const todayStart = now.startOf("day").toJSDate();
  const todayEnd = now.endOf("day").toJSDate();
  const dateLabel = now.toFormat("MMMM d, yyyy");

  // Only send to active, subscribed pharmacies that have an email
  const pharmacies = await Pharmacy.find({
    status: "ACTIVE",
    email: { $exists: true, $ne: "" },
  }).select("name email");

  console.log(`📊 [DailySummaryJob] Found ${pharmacies.length} pharmacies to notify.`);

  for (const pharmacy of pharmacies) {
    try {
      const pharmacyId = pharmacy._id;

      // Aggregate today's sales for this pharmacy
      const [salesAgg] = await Sale.aggregate([
        {
          $match: {
            pharmacyId,
            createdAt: { $gte: todayStart, $lte: todayEnd },
          },
        },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  totalRevenue: { $sum: "$totalAmount" },
                  totalTransactions: { $sum: 1 },
                  grossProfit: {
                    $sum: {
                      $reduce: {
                        input: "$items",
                        initialValue: 0,
                        in: {
                          $add: [
                            "$$value",
                            {
                              $multiply: [
                                {
                                  $subtract: [
                                    "$$this.unitPrice",
                                    { $ifNull: ["$$this.costPrice", 0] },
                                  ],
                                },
                                "$$this.quantity",
                              ],
                            },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
            topProducts: [
              { $unwind: "$items" },
              {
                $group: {
                  _id: "$items.productId",
                  name: { $last: "$items.productName" },
                  qtySold: { $sum: "$items.quantity" },
                  revenue: { $sum: "$items.total" },
                },
              },
              { $sort: { qtySold: -1 } },
              { $limit: 5 },
              { $project: { _id: 0, name: 1, qtySold: 1, revenue: 1 } },
            ],
            paymentBreakdown: [
              {
                $group: {
                  _id: "$paymentMethod",
                  amount: { $sum: "$totalAmount" },
                },
              },
              {
                $project: {
                  _id: 0,
                  method: { $ifNull: ["$_id", "Unknown"] },
                  amount: 1,
                },
              },
            ],
          },
        },
      ]);

      const summary = salesAgg?.summary?.[0] ?? {
        totalRevenue: 0,
        totalTransactions: 0,
        grossProfit: 0,
      };

      await sendDailySalesSummaryEmail({
        pharmacyEmail: pharmacy.email!,
        pharmacyName: pharmacy.name,
        date: dateLabel,
        totalRevenue: summary.totalRevenue ?? 0,
        totalTransactions: summary.totalTransactions ?? 0,
        grossProfit: summary.grossProfit ?? 0,
        topProducts: salesAgg?.topProducts ?? [],
        paymentBreakdown: salesAgg?.paymentBreakdown ?? [],
      });
    } catch (err) {
      console.error(
        `❌ [DailySummaryJob] Failed to send summary for pharmacy ${pharmacy.name}:`,
        err
      );
    }
  }

  console.log("✅ [DailySummaryJob] Daily summaries sent.");
}

export const startDailySummaryJob = () => {
  // Nepal is UTC+5:45. 8:00 PM NST = 14:15 UTC → cron: "15 14 * * *"
  cron.schedule("15 14 * * *", runDailySummary, {
    timezone: "UTC",
  });

  console.log("✅ Daily summary cron job registered (8:00 PM Nepal time).");
};
