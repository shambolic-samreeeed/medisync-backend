import mongoose, { Document, Schema } from "mongoose";

export interface CartItem {
  medicineId: string;
  batchNo: string;
  name: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface SaleDocument extends Document {
  saleId: string;
  pharmacyId: string; // ✅ add this
  items: CartItem[];
  totalAmount: number;
  paidAmount: number;
  change: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  paymentMethod?: string;
  invoiceNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema<CartItem>({
  medicineId: { type: String, required: true },
  batchNo: { type: String, required: true },
  name: { type: String, required: true },
  unitPrice: { type: Number, required: true },
  quantity: { type: Number, required: true },
  total: { type: Number, required: true },
});

const saleSchema = new Schema<SaleDocument>(
  {
    saleId: { type: String, required: true, unique: true },
    pharmacyId: { type: String, required: true }, // ✅ add here
    items: { type: [cartItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, required: true },
    change: { type: Number, required: true },
    customerName: { type: String },
    customerPhone: { type: String },
    customerEmail: { type: String },
    paymentMethod: { type: String },
    invoiceNumber: { type: String, required: true },
  },
  { timestamps: true }
);

const Sale = mongoose.model<SaleDocument>("Sale", saleSchema);

export default Sale;
