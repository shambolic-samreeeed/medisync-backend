// FILE: src/controller/appointmentController.ts
import { Request, Response } from "express";
import Doctor from "../models/Doctor";
import Appointment from "../models/Appointment";

const VALID_STATUSES = ["WAITING", "IN_CONSULTATION", "COMPLETED", "CANCELLED"] as const;
type AppointmentStatus = typeof VALID_STATUSES[number];

export const bookAppointment = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user.pharmacyId;
    const { doctorId, customerName, customerPhone } = req.body;

    if (!doctorId || !customerName?.trim()) {
      return res.status(400).json({ success: false, message: "doctorId and customerName are required." });
    }

    const doctor = await Doctor.findOne({ _id: doctorId, pharmacyId, isActive: true });
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Active doctor not found for this pharmacy." });
    }

    const feeCollected  = doctor.consultationFee;
    const pharmacyShare = doctor.pharmacyCommission;
    const doctorPayout  = feeCollected - pharmacyShare;

    const appointment = await Appointment.create({
      pharmacyId,
      doctorId,
      customerName: customerName.trim(),
      customerPhone: customerPhone?.trim() || undefined,
      feeCollected,
      pharmacyShare,
      doctorPayout,
      status: "WAITING",
    });

    // Populate doctor info so the response is immediately usable by the frontend
    await appointment.populate("doctorId", "name specialization photoUrl");

    return res.status(201).json({
      success: true,
      message: "Patient added to queue",
      data: appointment,
    });
  } catch (error: any) {
    console.error("[bookAppointment]", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getDailyQueue = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user.pharmacyId;

    // Default to today; accept ?date=YYYY-MM-DD
    const dateStr   = req.query.date as string | undefined;
    const baseDate  = dateStr ? new Date(dateStr) : new Date();

    // Guard: if dateStr is invalid, fall back to today
    const target    = isNaN(baseDate.getTime()) ? new Date() : baseDate;

    const startOfDay = new Date(target); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(target); endOfDay.setHours(23, 59, 59, 999);

    const queue = await Appointment.find({
      pharmacyId,
      appointmentDate: { $gte: startOfDay, $lte: endOfDay },
    })
      .populate("doctorId", "name specialization photoUrl")
      .sort({ createdAt: 1 });   // oldest first = queue order

    return res.status(200).json({ success: true, data: queue });
  } catch (error: any) {
    console.error("[getDailyQueue]", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAppointmentStatus = async (req: Request, res: Response) => {
  try {
    const pharmacyId     = (req as any).user.pharmacyId;
    const { appointmentId } = req.params;
    const { status, linkedSaleId } = req.body;

    // ── Validate status value BEFORE touching the DB ──────────────────────────
    if (!status || !VALID_STATUSES.includes(status as AppointmentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(", ")}`,
      });
    }

    const appointment = await Appointment.findOne({ _id: appointmentId, pharmacyId });
    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const prevStatus = appointment.status;

    // ── Update doctor's pending balance ───────────────────────────────────────
    // Add payout when marking COMPLETED (and wasn't already COMPLETED)
    if (status === "COMPLETED" && prevStatus !== "COMPLETED") {
      await Doctor.findByIdAndUpdate(
        appointment.doctorId,
        { $inc: { pendingBalance: appointment.doctorPayout } }
      );
    }
    // Subtract payout when un-completing (edge case — reverting from COMPLETED)
    if (prevStatus === "COMPLETED" && status !== "COMPLETED") {
      await Doctor.findByIdAndUpdate(
        appointment.doctorId,
        { $inc: { pendingBalance: -appointment.doctorPayout } }
      );
    }

    // ── Persist the new status ─────────────────────────────────────────────────
    appointment.status = status as AppointmentStatus;
    if (linkedSaleId) appointment.linkedSaleId = linkedSaleId;
    await appointment.save();

    // Return populated document so frontend can update queue immediately
    await appointment.populate("doctorId", "name specialization photoUrl");

    return res.status(200).json({
      success: true,
      message: `Appointment status updated to ${status}`,
      data: appointment,
    });
  } catch (error: any) {
    console.error("[updateAppointmentStatus]", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const settleDoctorPayment = async (req: Request, res: Response) => {
  try {
    const pharmacyId    = (req as any).user.pharmacyId;
    const { doctorId }  = req.params;
    const { amountPaid } = req.body;

    if (!amountPaid || Number(amountPaid) <= 0) {
      return res.status(400).json({ success: false, message: "amountPaid must be greater than 0." });
    }

    const doctor = await Doctor.findOne({ _id: doctorId, pharmacyId });
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found." });
    }

    if (Number(amountPaid) > doctor.pendingBalance) {
      return res.status(400).json({
        success: false,
        message: `Cannot settle Rs. ${amountPaid}. Pending balance is only Rs. ${doctor.pendingBalance}.`,
      });
    }

    doctor.pendingBalance -= Number(amountPaid);
    await doctor.save();

    return res.status(200).json({
      success: true,
      message: `Rs. ${amountPaid} settled for Dr. ${doctor.name}`,
      newBalance: doctor.pendingBalance,
      data: doctor,
    });
  } catch (error: any) {
    console.error("[settleDoctorPayment]", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};