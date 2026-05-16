/**
 * @file src/models/SubscriptionPlan.ts
 * @description Configurable subscription plan definitions.
 * Plans are stored in the DB so super-admins can adjust limits/features
 * without code deploys.
 */
import mongoose, { Schema, Document } from "mongoose";

export type PlanTier = "STARTER" | "PROFESSIONAL" | "ENTERPRISE";

export interface IPlanFeatures {
  inventoryManagement: boolean;
  basicPOS: boolean;
  digitalReceipts: boolean;
  clinicModule: boolean;
  expiryAlerts: boolean;
  analyticsBasic: boolean;
  analyticsAdvanced: boolean;
  multiBranch: boolean;
  auditLogs: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
  maxStaffAccounts: number; // -1 = unlimited
}

export interface ISubscriptionPlan extends Document {
  tier: PlanTier;
  name: string;
  description: string;
  priceMonthly: number; // in NPR (or smallest currency unit)
  priceYearly: number;
  features: IPlanFeatures;
  trialDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const planFeaturesSchema = new Schema<IPlanFeatures>(
  {
    inventoryManagement: { type: Boolean, default: false },
    basicPOS: { type: Boolean, default: false },
    digitalReceipts: { type: Boolean, default: false },
    clinicModule: { type: Boolean, default: false },
    expiryAlerts: { type: Boolean, default: false },
    analyticsBasic: { type: Boolean, default: false },
    analyticsAdvanced: { type: Boolean, default: false },
    multiBranch: { type: Boolean, default: false },
    auditLogs: { type: Boolean, default: false },
    apiAccess: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    maxStaffAccounts: { type: Number, default: 1 },
  },
  { _id: false }
);

const subscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    tier: {
      type: String,
      enum: ["STARTER", "PROFESSIONAL", "ENTERPRISE"],
      required: true,
      unique: true,
    },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    priceMonthly: { type: Number, required: true, min: 0 },
    priceYearly: { type: Number, required: true, min: 0 },
    features: { type: planFeaturesSchema, required: true },
    trialDays: { type: Number, default: 14 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const SubscriptionPlan = mongoose.model<ISubscriptionPlan>(
  "SubscriptionPlan",
  subscriptionPlanSchema
);

export default SubscriptionPlan;
