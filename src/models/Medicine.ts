import mongoose, { Schema, Document } from "mongoose";

export interface IMedicine extends Document {
  medicineId: string;       // SKU / internal code
  name: string;
  batchNo: string;
  expiryDate: Date;
  stock: number;            // tablets / units
  unitPrice: number;
  supplier?: string;
}

const MedicineSchema = new Schema<IMedicine>(
  {
    medicineId: { type: String, required: true },
    name: { type: String, required: true },
    batchNo: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    stock: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    supplier: { type: String },
  },
  { timestamps: true }
);

// one batch = one stock record
MedicineSchema.index(
  { medicineId: 1, batchNo: 1 },
  { unique: true }
);

export default mongoose.model<IMedicine>("Medicine", MedicineSchema);
