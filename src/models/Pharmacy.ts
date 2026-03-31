import mongoose, { Document, Schema } from "mongoose";

export interface PharmacyDocument extends Document {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  plan:"STARTER"|"PROFESSIONAL"|"ENTERPRISE";
  planStartDate?: Date;
  planEndDate?: Date;

  paymentStatus:"PAID"|"UNPAID"|"OVERDUE";

  status:"ACTIVE"|"SUSPENDED"|"CANCELLED";
  
  createdAt: Date;
  updatedAt: Date;
}

const pharmacySchema = new Schema<PharmacyDocument>(
  {
    name: { type: String, required: true, unique: true },
    address: { type: String },
    phone: { type: String },
    email: { type: String },

    plan:{
      type: String,
      enum: ["STARTER", "PROFESSIONAL", "ENTERPRISE"],
      default: "STARTER",
    },
    planStartDate: { type: Date },
    planEndDate: { type: Date },
    paymentStatus: {
      type: String,
      enum: ["PAID", "UNPAID", "OVERDUE"],
      default: "UNPAID",
    },
    status:{
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "CANCELLED"],
      default: "ACTIVE",
    }
  },
  { timestamps: true }
);

const Pharmacy = mongoose.model<PharmacyDocument>("Pharmacy", pharmacySchema);
export default Pharmacy;
