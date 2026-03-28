import mongoose, { Schema, Document } from "mongoose";

export interface IDoctor extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  name: string;
  specialization: string;
  photoUrl?: string;
  qualifications: string[]; 
  experienceYears?: number;
  licenseNumber?: string;
  phone?: string;
  email?: string;
  consultationFee: number;
  pharmacyCommission: number; 
  pendingBalance: number; 
  availability: {
    dayOfWeek: string;
    startTime: string; // "HH:mm"
    endTime: string;   // "HH:mm"
  }[];
  avgConsultationTime: number; 
  isActive: boolean;
}

const doctorSchema = new Schema<IDoctor>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true },
    name: { type: String, required: true, trim: true },
    specialization: { type: String, required: true },
    photoUrl: { type: String, default: "" },
    qualifications: { type: [String], default: [] },
    experienceYears: { type: Number, default: 0 },
    licenseNumber: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    consultationFee: { type: Number, required: true },
    pharmacyCommission: { type: Number, required: true, default: 0 },
    pendingBalance: { type: Number, default: 0 }, 
    availability: [
      {
        dayOfWeek: { 
          type: String, 
          enum: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
          required: true 
        },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true }
      }
    ],
    avgConsultationTime: { type: Number, default: 15 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.Doctor || mongoose.model<IDoctor>("Doctor", doctorSchema);