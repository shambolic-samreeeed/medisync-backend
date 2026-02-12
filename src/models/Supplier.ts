import mongoose, { Schema, Document } from "mongoose";

export interface ISupplier extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<ISupplier>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true },

    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    address: { type: String, trim: true },
  },
  { timestamps: true }
);

// Unique supplier name per pharmacy
supplierSchema.index({ pharmacyId: 1, name: 1 }, { unique: true });

const Supplier = mongoose.models.Supplier || mongoose.model<ISupplier>("Supplier", supplierSchema);
export default Supplier;
