import mongoose, { Schema, Document } from "mongoose";

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

  costPrice: number;
  sellingPrice: number;

  supplier?: string;

  expiryDate: Date;
  manufactureDate?: Date;

  // ✅ BATCH TRACKING (NEW)
  batches: Array<{
    batchNo: string;
    stock: number;
    costPrice: number;
    sellingPrice: number;
    expiryDate: Date;
    purchaseId?: mongoose.Types.ObjectId;
    createdAt: Date;
  }>;

  posStatus: "ACTIVE" | "BLOCKED";
  isDisposed: boolean;
}

const batchSchema = new Schema(
  {
    batchNo: String,
    stock: Number,
    costPrice: Number,
    sellingPrice: Number,
    expiryDate: Date,
    purchaseId: { type: Schema.Types.ObjectId, ref: "Purchase" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const medicineSchema = new Schema<IMedicine>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },

    medicineId: { type: String, required: true },
    barcode: String,

    name: { type: String, required: true },
    brand: String,
    category: String,
    description: String,

    batchNo: { type: String, required: true },

    stock: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    unit: String,

    costPrice: { type: Number, required: true },
    sellingPrice: { type: Number, required: true },

    supplier: String,

    expiryDate: Date,
    manufactureDate: Date,

    batches: [batchSchema],

    posStatus: { type: String, default: "ACTIVE" },
    isDisposed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ✅ important index for CSV + batch safety
medicineSchema.index({ pharmacyId: 1, medicineId: 1, batchNo: 1 }, { unique: true });

export default mongoose.model<IMedicine>("Medicine", medicineSchema);