/**
 * @file models/Medicine.ts
 * @description
 * Medicine model for MediSync.
 *
 * Key design:
 * - One collection for all pharmacies.
 * - Each medicine row belongs to a pharmacy using `pharmacyId`.
 * - Unique constraint is per pharmacy (so different pharmacies can have same batch).
 */

import mongoose, { Schema, Document } from "mongoose";

export interface IMedicine extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  uploadedBy?: mongoose.Types.ObjectId;

  medicineId?: string;
  barcode?: string;
  name: string;
  brand?: string;
  category?: string;
  description?: string;
  batchNo: string;
  stock: number;
  reorderLevel: number;
  unit?: string;
  unitPrice: number;
  supplier?: string;
  expiryDate: Date;
  manufactureDate?: Date;
  addedAt: Date;
}

const medicineSchema = new Schema<IMedicine>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },

    medicineId: { type: String },
    barcode: { type: String },
    name: { type: String, required: true, trim: true },
    brand: { type: String },
    category: { type: String },
    description: { type: String },

    batchNo: { type: String, required: true, trim: true },

    stock: { type: Number, required: true, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    unit: { type: String },

    unitPrice: { type: Number, required: true },
    supplier: { type: String },

    expiryDate: { type: Date, required: true },
    manufactureDate: { type: Date },
    addedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ Unique per pharmacy (adjust fields if your uniqueness rule differs)
medicineSchema.index({ pharmacyId: 1, name: 1, batchNo: 1 }, { unique: true });

const Medicine = mongoose.model<IMedicine>("Medicine", medicineSchema);
export default Medicine;
