import mongoose, { Schema, Document } from "mongoose";
import { v4 as uuidv4 } from "uuid";

export interface IMedicine extends Document {
  // --- Identifiers ---
  medicineId: string;       // UUID / internal code
  barcode?: string;         // optional SKU / barcode

  // --- Basic Info ---
  name: string;
  brand?: string;
  category?: string;
  description?: string;

  // --- Inventory / Stock ---
  batchNo: string;          // batch number
  stock: number;            // tablets / units
  reorderLevel?: number;    // min stock alert
  unit?: string;            // tablet / strip / bottle
  unitPrice: number;
  supplier?: string;

  // --- Dates ---
  expiryDate: Date;
  manufactureDate?: Date;
  addedAt: Date;
}

const MedicineSchema = new Schema<IMedicine>(
  {
    medicineId: { type: String, required: true, default: uuidv4 },
    barcode: { type: String },

    name: { type: String, required: true },
    brand: { type: String },
    category: { type: String },
    description: { type: String },

    batchNo: { type: String, required: true },
    stock: { type: Number, required: true },
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

// One batch per medicine
MedicineSchema.index({ medicineId: 1, batchNo: 1 }, { unique: true });

export default mongoose.model<IMedicine>("Medicine", MedicineSchema);
