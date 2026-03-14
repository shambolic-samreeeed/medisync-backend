/**
 * @file models/Medicine.ts
 * @description Medicine model for MediSync.
 */

import mongoose, { Schema, Document } from "mongoose";

export type POSStatus = "ACTIVE" | "BLOCKED";

export interface IMedicine extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  uploadedBy?: mongoose.Types.ObjectId;

  medicineId: string;
  barcode?: string;
  name: string;
  brand?: string;
  category?: string;
  description?: string;

  batchNo: string;

  stock: number;
  reorderLevel: number;
  unit?: string;
  
  // ✅ CHANGED: Split unitPrice into cost and selling price
  costPrice: number;
  sellingPrice: number;
  
  supplier?: string;

  expiryDate: Date;
  manufactureDate?: Date;
  addedAt: Date;

  posStatus: POSStatus;
  isDisposed: boolean;
  disposedAt?: Date;
  disposedBy?: mongoose.Types.ObjectId;
  disposeNote?: string;
}

const medicineSchema = new Schema<IMedicine>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },

    medicineId: { type: String, required: true, trim: true },

    barcode: { type: String },
    name: { type: String, required: true, trim: true },
    brand: { type: String },
    category: { type: String },
    description: { type: String },

    batchNo: { type: String, required: true, trim: true },

    stock: { type: Number, required: true, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    unit: { type: String },

    // Added required cost and selling prices
    costPrice: { type: Number, required: true },
    sellingPrice: { type: Number, required: true },
    
    supplier: { type: String },

    expiryDate: { type: Date, required: true },
    manufactureDate: { type: Date },
    addedAt: { type: Date, default: Date.now },

    posStatus: { type: String, enum: ["ACTIVE", "BLOCKED"], default: "ACTIVE" },
    isDisposed: { type: Boolean, default: false },
    disposedAt: { type: Date },
    disposedBy: { type: Schema.Types.ObjectId, ref: "User" },
    disposeNote: { type: String },
  },
  { timestamps: true }
);

medicineSchema.index({ pharmacyId: 1, medicineId: 1, batchNo: 1 }, { unique: true });

const Medicine = mongoose.model<IMedicine>("Medicine", medicineSchema);
export default Medicine;