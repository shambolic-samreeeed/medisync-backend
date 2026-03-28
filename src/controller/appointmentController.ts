import { Request, Response } from "express";
import Doctor from "../models/Doctor";
import Appointment from "../models/Appointment";

export const bookAppointment = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user.pharmacyId;
    const { doctorId, customerName, customerPhone } = req.body;

    const doctor = await Doctor.findOne({ _id: doctorId, pharmacyId, isActive: true });
    if (!doctor) return res.status(404).json({ message: "Doctor not found or inactive" });

    // 🚀 SMART AVAILABILITY CHECK
    const now = new Date();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + 
                        now.getMinutes().toString().padStart(2, '0');

    const isOpen = doctor.availability.some((slot: any) => 
      slot.dayOfWeek === currentDay && currentTime >= slot.startTime && currentTime <= slot.endTime
    );

    if (!isOpen) {
      return res.status(400).json({ 
        message: `Dr. ${doctor.name} is not available at this time (${currentDay} ${currentTime}).` 
      });
    }

    const appointment = await Appointment.create({
      pharmacyId,
      doctorId,
      customerName,
      customerPhone,
      feeCollected: doctor.consultationFee,
      pharmacyShare: doctor.pharmacyCommission,
      doctorPayout: doctor.consultationFee - doctor.pharmacyCommission,
      status: "WAITING"
    });

    res.status(201).json({ success: true, data: appointment });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDailyQueue = async (req: Request, res: Response) => {
  const pharmacyId = (req as any).user.pharmacyId;
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(); end.setHours(23,59,59,999);

  const queue = await Appointment.find({
    pharmacyId,
    appointmentDate: { $gte: start, $lte: end }
  }).populate("doctorId", "name specialization photoUrl").sort({ appointmentDate: 1 });

  res.status(200).json({ success: true, data: queue });
};

export const updateStatus = async (req: Request, res: Response) => {
  const { appointmentId } = req.params;
  const { status, linkedSaleId } = req.body;

  const apt = await Appointment.findById(appointmentId);
  if (!apt) return res.status(404).json({ message: "Appointment not found" });

  // Update Doctor Ledger if completed
  if (status === "COMPLETED" && apt.status !== "COMPLETED") {
    await Doctor.findByIdAndUpdate(apt.doctorId, { $inc: { pendingBalance: apt.doctorPayout } });
  }

  apt.status = status;
  if (linkedSaleId) apt.linkedSaleId = linkedSaleId;
  await apt.save();

  res.status(200).json({ success: true });
};

export const settlePayment = async (req: Request, res: Response) => {
  const { doctorId } = req.params;
  const { amountPaid } = req.body;

  const doctor = await Doctor.findById(doctorId);
  if (amountPaid > doctor.pendingBalance) return res.status(400).json({ message: "Insufficient balance" });

  doctor.pendingBalance -= amountPaid;
  await doctor.save();

  res.status(200).json({ success: true, newBalance: doctor.pendingBalance });
};