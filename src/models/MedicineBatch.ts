import mongoose, { Schema, Document, Types } from "mongoose";

export interface IMedicineBatch extends Document {
  medicine: Types.ObjectId;
  batchNumber: string;
  expiryDate: Date;
  quantityInStock: number;
  purchasePrice: number;
}

const MedicineBatchSchema = new Schema<IMedicineBatch>(
  {
    medicine: {
      type: Schema.Types.ObjectId,
      ref: "Medicine",
      required: true,
    },
    batchNumber: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    quantityInStock: { type: Number, required: true },
    purchasePrice: { type: Number, required: true },
  },
  { timestamps: true }
);

// Prevent duplicate batches for same medicine
MedicineBatchSchema.index(
  { medicine: 1, batchNumber: 1 },
  { unique: true }
);

export default mongoose.model<IMedicineBatch>(
  "MedicineBatch",
  MedicineBatchSchema
);
