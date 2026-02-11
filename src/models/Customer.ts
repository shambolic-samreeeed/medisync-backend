// models/Customer.ts
import mongoose, { Document, Schema } from "mongoose";

export interface CustomerDocument extends Document {
  pharmacyId: string;       // links customer to a specific pharmacy
  name: string;
  phone: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<CustomerDocument>(
  {
    pharmacyId: { type: String, required: true }, // DO NOT accept from client, set from auth
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: false }, // uniqueness per pharmacy enforced in controller
    email: { type: String },
  },
  { timestamps: true }
);

const Customer = mongoose.model<CustomerDocument>("Customer", customerSchema);

export default Customer;
