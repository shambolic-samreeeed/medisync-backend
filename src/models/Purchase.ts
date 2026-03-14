import mongoose, { Schema, Document } from "mongoose";

export interface IPurchaseItem {
  medicineId: string;
  name: string;
  batchNo: string;
  quantity: number;
  unitPrice: number; 
  expiryDate: Date;
  supplier?: string;
}

export interface IPurchase extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  supplierId: mongoose.Types.ObjectId;
  invoiceNumber: string;
  purchaseDate: Date;

  dueDate: Date;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";

  items: IPurchaseItem[];
  createdAt: Date;
  updatedAt: Date;
}

const purchaseItemSchema = new Schema<IPurchaseItem>(
  {
    medicineId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    batchNo: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    expiryDate: { type: Date, required: true },
    supplier: { type: String, trim: true },
  },
  { _id: false }
);

const purchaseSchema = new Schema<IPurchase>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    invoiceNumber: { type: String, required: true, trim: true },
    purchaseDate: { type: Date, default: Date.now },

    dueDate: { type: Date, required: true },
    totalAmount: { type: Number, required: true, default: 0 },
    paidAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ["UNPAID", "PARTIAL", "PAID"], default: "UNPAID" },
    items: { type: [purchaseItemSchema], default: [] },
  },
  { timestamps: true }
);

purchaseSchema.index(
  { pharmacyId: 1, supplierId: 1, invoiceNumber: 1 },
  { unique: true }
);

export default mongoose.models.Purchase ||
  mongoose.model<IPurchase>("Purchase", purchaseSchema);
