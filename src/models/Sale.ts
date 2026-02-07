import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema({
  medicineId: String,
  batchNo: String,
  name: String,
  unitPrice: Number,
  quantity: Number,
  total: Number,
});

const saleSchema = new mongoose.Schema({
  saleId: { type: String, required: true, unique: true },
  timestamp: { type: Date, default: Date.now },
  items: [cartItemSchema],
  totalAmount: Number,
  paidAmount: Number,
  change: Number,
  invoiceNumber: String,
  customerName: String,
  customerPhone: String,
  customerEmail: String,
  paymentMethod: String,
});

export default mongoose.model("Sale", saleSchema);
