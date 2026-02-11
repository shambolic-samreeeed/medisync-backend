import mongoose, { Document, Schema } from "mongoose";

export interface CustomerDocument extends Document {
  name: string;
  phone: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<CustomerDocument>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String },
  },
  { timestamps: true }
);

const Customer = mongoose.model<CustomerDocument>("Customer", customerSchema);

export default Customer;
