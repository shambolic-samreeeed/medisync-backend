/**
 * @file src/models/Pharmacy.ts
 * @description Core pharmacy document.
 * Subscription details are stored in the Subscription collection (normalized).
 * A denormalised snapshot (plan, status) is kept here for fast middleware checks.
 */
import mongoose, { Document, Schema } from "mongoose";
import { PlanTier } from "./SubscriptionPlan";

export interface PharmacyDocument extends Document {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  licenseNumber?: string;
  logoUrl?: string;

  // Denormalised subscription snapshot (kept in sync by SubscriptionService)
  plan: PlanTier;
  subscriptionStatus: "TRIAL" | "ACTIVE" | "EXPIRED" | "SUSPENDED" | "CANCELLED";
  planEndDate?: Date;

  // Legacy fields kept for backward compat — mapped from subscriptionStatus
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED";

  ownerId?: mongoose.Types.ObjectId; // pharmacist who owns this pharmacy

  createdAt: Date;
  updatedAt: Date;
}

const pharmacySchema = new Schema<PharmacyDocument>(
  {
    name: { type: String, required: true, unique: true },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    licenseNumber: { type: String },
    logoUrl: { type: String },

    plan: {
      type: String,
      enum: ["STARTER", "PROFESSIONAL", "ENTERPRISE"],
      default: "STARTER",
    },
    subscriptionStatus: {
      type: String,
      enum: ["TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED"],
      default: "TRIAL",
    },
    planEndDate: { type: Date },

    // Legacy field — keep for backward compat with existing middleware
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "CANCELLED"],
      default: "ACTIVE",
    },

    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const Pharmacy = mongoose.model<PharmacyDocument>("Pharmacy", pharmacySchema);
export default Pharmacy;
