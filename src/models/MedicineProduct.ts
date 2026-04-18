// models/MedicineProduct.ts

import mongoose, { Schema, Document } from "mongoose";

export type DosageForm =
  | "tablet"  | "capsule"   | "syrup"     | "injection"
  | "drops"   | "cream"     | "ointment"  | "inhaler"
  | "patch"   | "suppository" | "powder"  | "solution"
  | "other";

export interface IMedicineProduct extends Document {
  pharmacyId:       mongoose.Types.ObjectId;
  masterId:         mongoose.Types.ObjectId; // → MedicineMaster (Paracetamol)

  // Product identity
  productCode:      string;       // your internal SKU
  barcode?:         string;       // physical barcode on box
  brandName?:       string;       // "Panadol", "Calpol", "Tylenol"
  manufacturer:     string;       // "GSK", "Cipla"
  
  // THIS is what your supervisor meant — strength matters here
  strength:         string;       // "500mg", "250mg/5ml", "10mg/2ml"
  dosageForm:       DosageForm;   // tablet, syrup, injection...
  packSize:         number;       // tablets per strip/bottle — e.g., 10, 100, 200ml
  unit:             string;       // "tablet", "ml", "capsule"

  // Selling config
  sellingPrice:     number;       // default price (can be overridden per batch)
  reorderLevel:     number;       // minimum stock before alert triggers
  maxStockLevel?:   number;       // for over-stocking alerts

  supplier?:        string;
  
  // POS
  posStatus:        "ACTIVE" | "BLOCKED";
  isActive:         boolean;
}

const MedicineProductSchema = new Schema<IMedicineProduct>(
  {
    pharmacyId:    { type: Schema.Types.ObjectId, ref: "Pharmacy",       required: true },
    masterId:      { type: Schema.Types.ObjectId, ref: "MedicineMaster", required: true },

    productCode:   { type: String, required: true, trim: true },
    barcode:       { type: String, trim: true },
    brandName:     { type: String, trim: true },
    manufacturer:  { type: String, required: true, trim: true },

    strength:      { type: String, required: true },  // "500mg"
    dosageForm:    {
      type: String,
      enum: ["tablet","capsule","syrup","injection","drops","cream",
             "ointment","inhaler","patch","suppository","powder","solution","other"],
      required: true
    },
    packSize:      { type: Number, required: true },
    unit:          { type: String, required: true },

    sellingPrice:  { type: Number, required: true },
    reorderLevel:  { type: Number, default: 0 },
    maxStockLevel: { type: Number },

    supplier:      { type: String },
    
    posStatus:     { type: String, enum: ["ACTIVE", "BLOCKED"], default: "ACTIVE" },
    isActive:      { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Same product (brand + strength + form) can't be duplicated per pharmacy
MedicineProductSchema.index(
  { pharmacyId: 1, productCode: 1 },
  { unique: true }
);

MedicineProductSchema.index(
  { pharmacyId: 1, barcode: 1 },
  { sparse: true } // sparse because barcode is optional
);

const MedicineProduct = mongoose.model<IMedicineProduct>("MedicineProduct", MedicineProductSchema);
export default MedicineProduct;