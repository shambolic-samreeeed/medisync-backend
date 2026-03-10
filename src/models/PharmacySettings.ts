import mongoose, { Schema, Document } from "mongoose";

export interface IQRMethod{
  provider: string;
  imageUrl: string;
}

export interface IPharmacySettings extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  esewaMerchantId: string;
  khaltiPublicKey: string;
  khaltiSecretKey: string;
  qrMethods: IQRMethod[];
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
      default: "EPAYTEST",
    },
    khaltiPublicKey: {
      type: String,
      default: "", 
    },
    khaltiSecretKey:{
      type: String,
      default:""
    },
    qrMethods:[
      {
        provider: {type: String, required: true},
        imageUrl: {type: String, required: true},
      }
    ]
  },
  { timestamps: true }
);

export const PharmacySettings = 
  mongoose.models.PharmacySettings || 
  mongoose.model<IPharmacySettings>("PharmacySettings", pharmacySettingsSchema);