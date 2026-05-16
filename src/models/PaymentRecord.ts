/**
 * @file src/models/PaymentRecord.ts
 * @description Immutable audit log of every payment attempt/success.
 * Prepared for Khalti / eSewa / Stripe integration.
 */
import mongoose, { Schema, Document } from "mongoose";

export type PaymentGateway = "KHALTI" | "ESEWA" | "STRIPE" | "MANUAL";
export type PaymentRecordStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";

export interface IPaymentRecord extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  gateway: PaymentGateway;
  status: PaymentRecordStatus;
  amount: number;
  currency: string;
  gatewayTransactionId?: string;
  gatewayResponse?: Record<string, unknown>; // raw gateway payload for debugging
  description: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentRecordSchema = new Schema<IPaymentRecord>(
  {
    pharmacyId: {
      type: Schema.Types.ObjectId,
      ref: "Pharmacy",
      required: true,
      index: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
    },
    gateway: {
      type: String,
      enum: ["KHALTI", "ESEWA", "STRIPE", "MANUAL"],
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED", "REFUNDED"],
      default: "PENDING",
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "NPR" },
    gatewayTransactionId: { type: String, index: true, sparse: true },
    gatewayResponse: { type: Schema.Types.Mixed },
    description: { type: String, required: true },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

export const PaymentRecord = mongoose.model<IPaymentRecord>(
  "PaymentRecord",
  paymentRecordSchema
);

export default PaymentRecord;
