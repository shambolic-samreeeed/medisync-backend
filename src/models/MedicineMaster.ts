// models/MedicineMaster.ts

import mongoose, { Schema, Document } from "mongoose";

export interface IMedicineMaster extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;

  // Identity
  genericName: string;          // "Paracetamol" — the canonical name
  category: string;             // "Analgesic", "Antibiotic", etc.
  subCategory?: string;         // "NSAIDs", "Opioids", etc.
  description?: string;

  // Classification
  requiresPrescription: boolean;
  controlledSubstance: boolean; // for narcotics, psychotropics
  therapeuticClass?: string;    // "Antipyretic", "Beta-blocker"

  isActive: boolean;
}

const MedicineMasterSchema = new Schema<IMedicineMaster>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true },
    createdBy:  { type: Schema.Types.ObjectId, ref: "User",     required: true },

    genericName:           { type: String,  required: true, trim: true },
    category:              { type: String,  required: true },
    subCategory:           { type: String },
    description:           { type: String },

    requiresPrescription:  { type: Boolean, default: false },
    controlledSubstance:   { type: Boolean, default: false },
    therapeuticClass:      { type: String },

    isActive:              { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique generic medicine per pharmacy
MedicineMasterSchema.index(
  { pharmacyId: 1, genericName: 1 },
  { unique: true }
);

const MedicineMaster = mongoose.model<IMedicineMaster>("MedicineMaster", MedicineMasterSchema);
export default MedicineMaster;