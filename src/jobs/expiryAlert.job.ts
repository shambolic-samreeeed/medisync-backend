/**
 * @file src/jobs/expiryAlert.job.ts
 * @description
 * Sends expiry alert emails every morning at 8:00 AM Nepal time (02:15 UTC).
 *
 * Checks for batches expiring within the next 60 days and emails each pharmacy
 * that has both:
 *   - An active status
 *   - At least one batch expiring within the threshold
 *
 * Batches are grouped per pharmacy so each pharmacy gets one consolidated email
 * rather than one email per batch.
 *
 * Multi-tenant: each pharmacy's email is sent using THAT pharmacy's own SMTP config.
 * Pharmacies with no SMTP config are skipped gracefully.
 *
 * Cron: "15 2 * * *" → Nepal is UTC+5:45. 8:00 AM NST = 02:15 UTC.
 */

import cron from "node-cron";
import mongoose from "mongoose";
import Pharmacy from "../models/Pharmacy";
import Batch from "../models/Batch";
import { sendExpiryAlertEmail } from "../utils/emailService";
import { DateTime } from "luxon";

const NEPAL_TZ = "Asia/Kathmandu";

// Alert window: batches expiring within this many days are included in the email.
// Items ≤ 7 days are marked CRITICAL; 8–30 are EXPIRING SOON; 31–60 are EXPIRING.
const ALERT_THRESHOLD_DAYS = 60;

interface PharmacyDoc {
  _id: mongoose.Types.ObjectId;
  name: string;
  email?: string;
  status: string;
}

interface BatchDoc {
  _id: mongoose.Types.ObjectId;
  pharmacyId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  batchNumber: string;
  expiryDate: Date;
  currentQuantity: number;
  status: string;
  // populated
  product?: { brandName?: string };
}

async function runExpiryAlertJob() {
  console.log(" [ExpiryAlertJob] Checking for expiring batches...");

  const now = DateTime.now().setZone(NEPAL_TZ);
  const thresholdDate = now.plus({ days: ALERT_THRESHOLD_DAYS }).toJSDate();
  const today = now.startOf("day").toJSDate();

  // Fetch all active pharmacies with an email address
  const pharmacies = (await Pharmacy.find({
    status: "ACTIVE",
    email: { $exists: true, $ne: "" },
  })
    .select("name email _id")
    .lean()) as PharmacyDoc[];

  console.log(` [ExpiryAlertJob] Found ${pharmacies.length} pharmacies to check.`);

  for (const pharmacy of pharmacies) {
    try {
      // Find ACTIVE batches with stock > 0 that expire before the threshold
      const batches = (await Batch.find({
        pharmacyId: pharmacy._id,
        status: "ACTIVE",
        currentQuantity: { $gt: 0 },
        expiryDate: { $lte: thresholdDate },
      })
        .populate({ path: "productId", select: "brandName" })
        .lean()) as unknown as BatchDoc[];

      if (!batches.length) {
        console.log(` [ExpiryAlertJob] No expiring batches for ${pharmacy.name} — skipping.`);
        continue;
      }

      // Build alert items
      const items = batches.map((batch) => {
        const expiry = DateTime.fromJSDate(batch.expiryDate).setZone(NEPAL_TZ);
        const daysUntilExpiry = Math.ceil(expiry.diff(now, "days").days);
        return {
          brandName: (batch as any).productId?.brandName ?? "Unknown Medicine",
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          daysUntilExpiry,
          currentQuantity: batch.currentQuantity,
        };
      });

      await sendExpiryAlertEmail({
        pharmacyId: pharmacy._id.toString(),
        pharmacyEmail: pharmacy.email!,
        pharmacyName: pharmacy.name,
        items,
      });

      console.log(
        ` [ExpiryAlertJob] Alert sent for ${pharmacy.name} — ` +
          `${items.length} batch(es) expiring within ${ALERT_THRESHOLD_DAYS} days.`
      );
    } catch (err: any) {
      if (
        err.message?.includes("No email configuration") ||
        err.message?.includes("incomplete SMTP")
      ) {
        console.warn(
          `  [ExpiryAlertJob] Skipping ${pharmacy.name} — no SMTP config set. ` +
            "Configure email settings in the pharmacy settings panel."
        );
      } else {
        console.error(
          ` [ExpiryAlertJob] Failed to send expiry alert for ${pharmacy.name}:`,
          err.message
        );
      }
    }
  }

  console.log(" [ExpiryAlertJob] Expiry alert job completed.");
}

export const startExpiryAlertJob = () => {
  cron.schedule("45 2 * * *", runExpiryAlertJob, { timezone: "UTC" });
  console.log(" Expiry alert cron job registered (8:30 AM Nepal time, every day).");
};