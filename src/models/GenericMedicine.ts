import mongoose, { Schema, Document } from "mongoose";

export interface IGenericMedicine extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  genericName: string;
  strength: string;
  dosageForm: string;
  therapeuticClass?: string;
  category?: string;
  description?: string;
  requiresPrescription: boolean;
  controlledSubstance: boolean;
  searchTokens: string[];
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const GenericMedicineSchema = new Schema<IGenericMedicine>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true, index: true },

    genericName: { type: String, required: true, trim: true },
    strength: { type: String, required: true, trim: true },
    dosageForm: {
      type: String,
      required: true,
      enum: [
        "tablet", "capsule", "syrup", "injection", "drops",
        "cream", "ointment", "inhaler", "patch", "suppository",
        "powder", "solution", "other",
      ],
    },

    therapeuticClass: String,
    category: String,
    description: String,

    requiresPrescription: { type: Boolean, default: false },
    controlledSubstance: { type: Boolean, default: false },

    searchTokens: { type: [String], default: [], index: true },

    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

GenericMedicineSchema.index(
  { pharmacyId: 1, genericName: 1, strength: 1, dosageForm: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

GenericMedicineSchema.pre("save", function (next) {
  this.searchTokens = [
    this.genericName?.toLowerCase(),
    this.strength?.toLowerCase(),
    this.dosageForm?.toLowerCase(),
    this.therapeuticClass?.toLowerCase(),
    this.category?.toLowerCase(),
  ].filter(Boolean) as string[];
  next();
});

export default mongoose.models.GenericMedicine ||
  mongoose.model<IGenericMedicine>("GenericMedicine", GenericMedicineSchema);