import mongoose, { Schema, Document } from "mongoose";

export interface IProductMedicine extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  genericId: mongoose.Types.ObjectId;

  brandName: string;
  manufacturer: string;
  productCode: string;
  barcode?: string;
  packSize: number;
  unit: string;

  defaultSellingPrice: number;
  reorderLevel: number;
  maxStockLevel?: number;

  preferredSupplierId?: mongoose.Types.ObjectId;
  photoUrl?: string;

  searchTokens: string[];

  posStatus: "ACTIVE" | "BLOCKED";
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProductMedicineSchema = new Schema<IProductMedicine>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true, index: true },
    genericId: { type: Schema.Types.ObjectId, ref: "GenericMedicine", required: true, index: true },

    brandName: { type: String, required: true, trim: true },
    manufacturer: { type: String, required: true, trim: true },
    productCode: { type: String, required: true, trim: true },
    barcode: { type: String, trim: true },
    packSize: { type: Number, required: true, min: 1 },
    unit: { type: String, required: true },

    defaultSellingPrice: { type: Number, required: true, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    maxStockLevel: { type: Number, min: 0 },

    preferredSupplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    photoUrl: String,

    searchTokens: { type: [String], default: [], index: true },

    posStatus: { type: String, enum: ["ACTIVE", "BLOCKED"], default: "ACTIVE" },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

ProductMedicineSchema.index({ pharmacyId: 1, productCode: 1 }, { unique: true });
ProductMedicineSchema.index({ pharmacyId: 1, barcode: 1 }, { unique: true, sparse: true });
ProductMedicineSchema.index({ pharmacyId: 1, genericId: 1 });

ProductMedicineSchema.pre("save", function (next) {
  this.searchTokens = [
    this.brandName?.toLowerCase(),
    this.manufacturer?.toLowerCase(),
    this.productCode?.toLowerCase(),
    this.barcode?.toLowerCase(),
  ].filter(Boolean) as string[];
  next();
});

export default mongoose.models.ProductMedicine ||
  mongoose.model<IProductMedicine>("ProductMedicine", ProductMedicineSchema);