/**
 * @file src/models/Subscription.ts
 * @description Per-pharmacy subscription record.
 * A pharmacy always has exactly one active Subscription document.
 * Historical records are kept for audit/billing.
 */
import mongoose, { Schema, Document } from "mongoose";
import { PlanTier } from "./SubscriptionPlan";

export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
  | "CANCELLED";

export interface ISubscription extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  planTier: PlanTier;
  status: SubscriptionStatus;

  // Dates
  trialStartDate?: Date;
  trialEndDate?: Date;
  startDate: Date;
  endDate: Date;
  renewedAt?: Date;
  cancelledAt?: Date;
  suspendedAt?: Date;

  // Payment
  paymentStatus: "PAID" | "UNPAID" | "OVERDUE" | "REFUNDED";
  amountPaid: number;
  currency: string;
  paymentMethod?: string; // "KHALTI" | "ESEWA" | "STRIPE" | "MANUAL"
  paymentReference?: string;

  // Flags
  autoRenew: boolean;
  isTrial: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    pharmacyId: {
      type: Schema.Types.ObjectId,
      ref: "Pharmacy",
      required: true,
      index: true,
    },
    planTier: {
      type: String,
      enum: ["STARTER", "PROFESSIONAL", "ENTERPRISE"],
      required: true,
    },
    status: {
      type: String,
      enum: ["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED"],
      default: "TRIAL",
    },

    trialStartDate: { type: Date },
    trialEndDate: { type: Date },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    renewedAt: { type: Date },
    cancelledAt: { type: Date },
    suspendedAt: { type: Date },

    paymentStatus: {
      type: String,
      enum: ["PAID", "UNPAID", "OVERDUE", "REFUNDED"],
      default: "UNPAID",
    },
    amountPaid: { type: Number, default: 0 },
    currency: { type: String, default: "NPR" },
    paymentMethod: { type: String },
    paymentReference: { type: String },

    autoRenew: { type: Boolean, default: false },
    isTrial: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Index for the daily cron job: find all subscriptions expiring before now
subscriptionSchema.index({ endDate: 1, status: 1 });

export const Subscription = mongoose.model<ISubscription>(
  "Subscription",
  subscriptionSchema
);

export default Subscription;
