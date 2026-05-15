// // import mongoose, { Document, Schema } from "mongoose";

// // export interface CartItem {
// //   medicineId: string;
// //   batchNo: string;
// //   name: string;
// //   unitPrice: number; // Selling Price
// //   costPrice: number; // Buying Price from Supplier
// //   quantity: number;
// //   total: number;
// // }

// // export interface SaleDocument extends Document {
// //   saleId: string;
// //   pharmacyId: string; 
// //   items: CartItem[];
// //   totalAmount: number;
// //   paidAmount: number;
// //   change: number;
// //   customerName?: string;
// //   customerPhone?: string;
// //   customerEmail?: string;
// //   paymentMethod?: string;
// //   invoiceNumber: string;
// //   createdAt: Date;
// //   updatedAt: Date;
// // }

// // const cartItemSchema = new Schema<CartItem>({
// //   medicineId: { type: String, required: true },
// //   batchNo: { type: String, required: true },
// //   name: { type: String, required: true },
// //   unitPrice: { type: Number, required: true },
// //   costPrice: { type: Number, required: true }, 
// //   quantity: { type: Number, required: true },
// //   total: { type: Number, required: true },
// // });

// // const saleSchema = new Schema<SaleDocument>(
// //   {
// //     saleId: { type: String, required: true, unique: true },
// //     pharmacyId: { type: String, required: true }, 
// //     items: { type: [cartItemSchema], required: true },
// //     totalAmount: { type: Number, required: true },
// //     paidAmount: { type: Number, required: true },
// //     change: { type: Number, required: true },
// //     customerName: { type: String },
// //     customerPhone: { type: String },
// //     customerEmail: { type: String },
// //     paymentMethod: { type: String },
// //     invoiceNumber: { type: String, required: true },
// //   },
// //   { timestamps: true }
// // );

// // const Sale = mongoose.model<SaleDocument>("Sale", saleSchema);

// // export default Sale;

// import mongoose, { Document, Schema } from "mongoose";

// export interface CartItem {
//   productId: mongoose.Types.ObjectId;
//   batchId: mongoose.Types.ObjectId;
//   productName: string;
//   batchNumber: string;
//   unitPrice: number;
//   costPrice: number;
//   quantity: number;
//   total: number;
// }

// export interface SaleDocument extends Document {
//   saleId: string;
//   pharmacyId: mongoose.Types.ObjectId;
//   items: CartItem[];
//   totalAmount: number;
//   paidAmount: number;
//   change: number;
//   customerName?: string;
//   customerPhone?: string;
//   customerEmail?: string;
//   paymentMethod?: string;
//   invoiceNumber: string;
//   createdAt: Date;
//   updatedAt: Date;
// }

// const cartItemSchema = new Schema<CartItem>(
//   {
//     productId: { type: Schema.Types.ObjectId, ref: "ProductMedicine", required: true },
//     batchId: { type: Schema.Types.ObjectId, ref: "Batch", required: true },
//     productName: { type: String, required: true },
//     batchNumber: { type: String, required: true },
//     unitPrice: { type: Number, required: true },
//     costPrice: { type: Number, required: true },
//     quantity: { type: Number, required: true },
//     total: { type: Number, required: true },
//   },
//   { _id: false }
// );

// const saleSchema = new Schema<SaleDocument>(
//   {
//     saleId: { type: String, required: true, unique: true },
//     pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true, index: true },
//     items: { type: [cartItemSchema], required: true },
//     totalAmount: { type: Number, required: true },
//     paidAmount: { type: Number, required: true },
//     change: { type: Number, required: true },
//     customerName: String,
//     customerPhone: String,
//     customerEmail: String,
//     paymentMethod: String,
//     invoiceNumber: { type: String, required: true },
//   },
//   { timestamps: true }
// );

// saleSchema.index({ pharmacyId: 1, createdAt: -1 });

// const Sale = mongoose.models.Sale || mongoose.model<SaleDocument>("Sale", saleSchema);
// export default Sale;

import mongoose, { Document, Schema } from "mongoose";

export interface CartItem {
  productId: mongoose.Types.ObjectId;
  batchId: mongoose.Types.ObjectId;
  productName: string;
  batchNumber: string;
  unitPrice: number;
  costPrice: number;
  quantity: number;
  total: number;
}

export interface SaleDocument extends Document {
  saleId: string;
  pharmacyId: mongoose.Types.ObjectId;
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

const cartItemSchema = new Schema<CartItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "ProductMedicine", required: true },
    batchId: { type: Schema.Types.ObjectId, ref: "Batch", required: true },
    productName: { type: String, required: true },
    batchNumber: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    costPrice: { type: Number, required: true },
    quantity: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false }
);

const saleSchema = new Schema<SaleDocument>(
  {
    saleId: { type: String, required: true, unique: true },
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true, index: true },
    items: { type: [cartItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, required: true },
    change: { type: Number, required: true },
    customerName: String,
    customerPhone: String,
    customerEmail: String,
    paymentMethod: String,
    invoiceNumber: { type: String, required: true },
  },
  { timestamps: true }
);

saleSchema.index({ pharmacyId: 1, createdAt: -1 });

const Sale = mongoose.models.Sale || mongoose.model<SaleDocument>("Sale", saleSchema);
export default Sale;