import { Request, Response } from "express";
import Doctor from "../models/Doctor";
import Appointment from "../models/Appointment";

export const bookAppointment = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user.pharmacyId;
    const { doctorId, customerName, customerPhone } = req.body;

    const doctor = await Doctor.findOne({ _id: doctorId, pharmacyId, isActive: true });
    if (!doctor) return res.status(404).json({ message: "Active doctor not found" });

    const feeCollected = doctor.consultationFee;
    const pharmacyShare = doctor.pharmacyCommission;
    const doctorPayout = feeCollected - pharmacyShare;

    const appointment = await Appointment.create({
      pharmacyId, doctorId, customerName, customerPhone,
      feeCollected, pharmacyShare, doctorPayout, status: "WAITING"
    });

    return res.status(201).json({ success: true, message: "Patient added to queue", data: appointment });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getDailyQueue = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user.pharmacyId;
    const dateQuery = req.query.date ? new Date(req.query.date as string) : new Date();
    
    const startOfDay = new Date(dateQuery.setHours(0, 0, 0, 0));
    const endOfDay = new Date(dateQuery.setHours(23, 59, 59, 999));

    const queue = await Appointment.find({
      pharmacyId,
      appointmentDate: { $gte: startOfDay, $lte: endOfDay }
    }).populate("doctorId", "name specialization photoUrl").sort({ appointmentDate: 1 });

    return res.status(200).json({ success: true, data: queue });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAppointmentStatus = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user.pharmacyId;
    const { appointmentId } = req.params;
    const { status, linkedSaleId } = req.body;

    const appointment = await Appointment.findOne({ _id: appointmentId, pharmacyId });
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    if (status === "COMPLETED" && appointment.status !== "COMPLETED") {
      await Doctor.findByIdAndUpdate(appointment.doctorId, { $inc: { pendingBalance: appointment.doctorPayout } });
    }
    if (appointment.status === "COMPLETED" && status !== "COMPLETED") {
       await Doctor.findByIdAndUpdate(appointment.doctorId, { $inc: { pendingBalance: -appointment.doctorPayout } });
    }

    appointment.status = status;
    if (linkedSaleId) appointment.linkedSaleId = linkedSaleId;
    await appointment.save();

    return res.status(200).json({ success: true, message: `Status updated to ${status}`, data: appointment });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const settleDoctorPayment = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user.pharmacyId;
    const { doctorId } = req.params;
    const { amountPaid } = req.body; 

    const doctor = await Doctor.findOne({ _id: doctorId, pharmacyId });
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    if (amountPaid > doctor.pendingBalance) {
      return res.status(400).json({ message: "Cannot pay more than what is owed." });
    }

    doctor.pendingBalance -= amountPaid;
    await doctor.save();

    return res.status(200).json({ success: true, message: `Paid Rs. ${amountPaid}`, newBalance: doctor.pendingBalance });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};