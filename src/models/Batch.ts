import mongoose, { Schema, Document } from "mongoose";

export type BatchStatus = "ACTIVE" | "DEPLETED" | "DISPOSED" | "EXPIRED" | "BLOCKED";

export interface IDisposalEvent {
  quantity: number;
  reason: "EXPIRED" | "DAMAGED" | "RECALLED" | "OTHER";
  disposedAt: Date;
  disposedBy: mongoose.Types.ObjectId;
  note?: string;
}

export interface IBatch extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  genericId: mongoose.Types.ObjectId;

  batchNumber: string;
  manufactureDate?: Date;
  expiryDate: Date;

  initialQuantity: number;
  currentQuantity: number;
  disposedQuantity: number;

  costPrice: number;
  sellingPrice: number;

  supplierId?: mongoose.Types.ObjectId;
  purchaseId?: mongoose.Types.ObjectId;
  invoiceNumber?: string;

  status: BatchStatus;
  disposalEvents: IDisposalEvent[];

  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DisposalEventSchema = new Schema<IDisposalEvent>(
  {
    quantity: { type: Number, required: true, min: 1 },
    reason: { type: String, enum: ["EXPIRED", "DAMAGED", "RECALLED", "OTHER"], required: true },
    disposedAt: { type: Date, default: Date.now },
    disposedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    note: String,
  },
  { _id: true }
);

const BatchSchema = new Schema<IBatch>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "ProductMedicine", required: true, index: true },
    genericId: { type: Schema.Types.ObjectId, ref: "GenericMedicine", required: true, index: true },

    batchNumber: { type: String, required: true, trim: true },
    manufactureDate: Date,
    expiryDate: { type: Date, required: true, index: true },

    initialQuantity: { type: Number, required: true, min: 0 },
    currentQuantity: { type: Number, required: true, min: 0 },
    disposedQuantity: { type: Number, default: 0, min: 0 },

    costPrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },

    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    purchaseId: { type: Schema.Types.ObjectId, ref: "Purchase" },
    invoiceNumber: String,

    status: {
      type: String,
      enum: ["ACTIVE", "DEPLETED", "DISPOSED", "EXPIRED", "BLOCKED"],
      default: "ACTIVE",
      index: true,
    },

    disposalEvents: [DisposalEventSchema],

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

BatchSchema.index({ pharmacyId: 1, productId: 1, batchNumber: 1 }, { unique: true });
BatchSchema.index({ pharmacyId: 1, productId: 1, status: 1, expiryDate: 1 });
BatchSchema.index({ pharmacyId: 1, status: 1, expiryDate: 1 });
BatchSchema.index({ pharmacyId: 1, status: 1, currentQuantity: 1 });

export default mongoose.models.Batch ||
  mongoose.model<IBatch>("Batch", BatchSchema);