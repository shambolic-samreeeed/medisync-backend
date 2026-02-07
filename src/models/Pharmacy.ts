import mongoose, { Document, Schema } from "mongoose";

export interface PharmacyDocument extends Document {
  name: string;
  address?: string;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const pharmacySchema = new Schema<PharmacyDocument>(
  {
    name: { type: String, required: true, unique: true },
    address: { type: String },
    phone: { type: String },
  },
  { timestamps: true }
);

const Pharmacy = mongoose.model<PharmacyDocument>("Pharmacy", pharmacySchema);
export default Pharmacy;
