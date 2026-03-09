import mongoose, { Schema, Document } from "mongoose";

export interface IPharmacySettings extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  esewaMerchantId: string;
  khaltiPublicKey: string;
  khaltiSecretKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const pharmacySettingsSchema = new Schema<IPharmacySettings>(
  {
    pharmacyId: {
      type: Schema.Types.ObjectId,
      ref: "Pharmacy", // Make sure this matches your actual Pharmacy model name
      required: true,
      unique: true, 
    },
    esewaMerchantId: {
      type: String,
      default: "EPAYTEST", // Sandbox default
    },
    khaltiPublicKey: {
      type: String,
      default: "Key test_secret_key_f59e8b7d18b4499ca40f68195a846e9b", 
    },
    khaltiSecretKey:{
      type: String,
      default:''
    }
  },
  { timestamps: true }
);

export const PharmacySettings = 
  mongoose.models.PharmacySettings || 
  mongoose.model<IPharmacySettings>("PharmacySettings", pharmacySettingsSchema);