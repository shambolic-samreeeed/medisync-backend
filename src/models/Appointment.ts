import mongoose, { Schema, Document } from "mongoose";

export interface IAppointment extends Document {
  pharmacyId: mongoose.Types.ObjectId;
  doctorId: mongoose.Types.ObjectId;
  customerName: string;
  customerPhone?: string;
  appointmentDate: Date;
  status: "WAITING" | "IN_CONSULTATION" | "COMPLETED" | "CANCELLED";
  feeCollected: number;
  pharmacyShare: number; 
  doctorPayout: number; 
  linkedSaleId?: mongoose.Types.ObjectId; 
}

const appointmentSchema = new Schema<IAppointment>(
  {
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true },
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String },
    appointmentDate: { type: Date, default: Date.now },
    status: { 
      type: String, 
      enum: ["WAITING", "IN_CONSULTATION", "COMPLETED", "CANCELLED"], 
      default: "WAITING" 
    },
    feeCollected: { type: Number, required: true },
    pharmacyShare: { type: Number, required: true },
    doctorPayout: { type: Number, required: true },
    linkedSaleId: { type: Schema.Types.ObjectId, ref: "Sale" },
  },
  { timestamps: true }
);

export default mongoose.models.Appointment || mongoose.model<IAppointment>("Appointment", appointmentSchema);