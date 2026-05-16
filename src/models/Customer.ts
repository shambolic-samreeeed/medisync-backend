import mongoose, { Schema, Document } from "mongoose";

export interface ICustomer extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    pharmacyId: {
      type: Schema.Types.ObjectId,
      ref: "Pharmacy",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
  },
  { timestamps: true }
);

// Compound unique index: prevents duplicate phone within the same pharmacy.
// The same phone number is ALLOWED across different pharmacies (correct SaaS behaviour).
customerSchema.index({ pharmacyId: 1, phone: 1 }, { unique: true });

export default mongoose.model<ICustomer>("Customer", customerSchema);
