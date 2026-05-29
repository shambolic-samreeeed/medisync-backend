/**
 * @file controllers/appointmentController.ts
 * @description
 * Handles doctor appointment booking, queue management, slot generation,
 * appointment status updates, and doctor payment settlement for the
 * Pharmacy Management System.
 *
 * Core features:
 *  1. Prevents overlapping doctor appointments
 *  2. Validates doctor availability schedules
 *  3. Manages appointment queue workflow/status
 *  4. Generates real-time available booking slots
 *  5. Calculates doctor payout and pharmacy commission
 *  6. Tracks and settles pending doctor balances
 */

import { Request, Response } from "express";
import Doctor from "../models/Doctor";
import Appointment from "../models/Appointment";

const VALID_STATUSES = ["WAITING", "IN_CONSULTATION", "COMPLETED", "CANCELLED"] as const;
type AppointmentStatus = typeof VALID_STATUSES[number];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function getDayName(date: Date): string {
  return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][date.getDay()];
}

function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Book a new appointment for a doctor.
export const bookAppointment = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user.pharmacyId;
    const { doctorId, customerName, customerPhone, appointmentDate, appointmentTime } = req.body;

    if (!doctorId || !customerName?.trim()) {
      return res.status(400).json({ success: false, message: "doctorId and customerName are required." });
    }
    if (!appointmentDate || !appointmentTime) {
      return res.status(400).json({ success: false, message: "appointmentDate (YYYY-MM-DD) and appointmentTime (HH:mm) are required." });
    }

    const [year, month, day] = appointmentDate.split("-").map(Number);
    const [hour, minute] = appointmentTime.split(":").map(Number);
    if ([year, month, day, hour, minute].some(isNaN)) {
      return res.status(400).json({ success: false, message: "Invalid date or time format." });
    }

    const slotDateTime = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (isNaN(slotDateTime.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date or time." });
    }

    if (slotDateTime.getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: "Cannot book an appointment in the past." });
    }

    const doctor = await Doctor.findOne({ _id: doctorId, pharmacyId, isActive: true });
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Active doctor not found for this pharmacy." });
    }

    const dayName = getDayName(slotDateTime);
    const schedule = doctor.availability.find(
      (a: { dayOfWeek: string; startTime: string; endTime: string }) => a.dayOfWeek === dayName
    );
    if (!schedule) {
      return res.status(400).json({
        success: false,
        message: `Dr. ${doctor.name} is not available on ${dayName}s.`,
      });
    }

    const slotMinutes  = timeToMinutes(appointmentTime);
    const startMinutes = timeToMinutes(schedule.startTime);
    const endMinutes   = timeToMinutes(schedule.endTime);

    if (slotMinutes < startMinutes || slotMinutes >= endMinutes) {
      return res.status(400).json({
        success: false,
        message: `Dr. ${doctor.name} works ${schedule.startTime}–${schedule.endTime} on ${dayName}s. ${appointmentTime} is outside this window.`,
      });
    }

    const avgTime     = doctor.avgConsultationTime ?? 15;
    const windowStart = new Date(slotDateTime.getTime() - avgTime * 60 * 1000);
    const windowEnd   = new Date(slotDateTime.getTime() + avgTime * 60 * 1000);

    const clash = await Appointment.findOne({
      doctorId,
      pharmacyId,
      status: { $in: ["WAITING", "IN_CONSULTATION"] },
      appointmentDate: { $gte: windowStart, $lte: windowEnd },
    });

    if (clash) {
      return res.status(409).json({
        success: false,
        message: `Dr. ${doctor.name} already has an appointment at ${appointmentTime}. Please choose a different slot.`,
      });
    }

    const feeCollected  = doctor.consultationFee;
    const pharmacyShare = doctor.pharmacyCommission;
    const doctorPayout  = feeCollected - pharmacyShare;

    const appointment = await Appointment.create({
      pharmacyId,
      doctorId,
      customerName: customerName.trim(),
      customerPhone: customerPhone?.trim() || undefined,
      appointmentDate: slotDateTime,
      feeCollected,
      pharmacyShare,
      doctorPayout,
      status: "WAITING",
    });

    await appointment.populate("doctorId", "name specialization photoUrl");

    return res.status(201).json({ success: true, message: "Patient added to queue", data: appointment });
  } catch (error: any) {
    console.error("[bookAppointment]", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get the appointment que for the given date.
export const getDailyQueue = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user.pharmacyId;
    const dateStr = req.query.date as string | undefined;

    const query: any = { pharmacyId };

    if (dateStr) {
      const target = parseDateLocal(dateStr);
      if (isNaN(target.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD." });
      }
      const startOfDay = new Date(target); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay   = new Date(target); endOfDay.setHours(23, 59, 59, 999);
      query.appointmentDate = { $gte: startOfDay, $lte: endOfDay };
    }

    const queue = await Appointment.find(query)
      .populate("doctorId", "name specialization photoUrl")
      .sort({ appointmentDate: 1 });

    return res.status(200).json({ success: true, data: queue });
  } catch (error: any) {
    console.error("[getDailyQueue]", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update appointment status 
export const updateAppointmentStatus = async (req: Request, res: Response) => {
  try {
    const pharmacyId        = (req as any).user.pharmacyId;
    const { appointmentId } = req.params;
    const { status, linkedSaleId } = req.body;

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

    const prevStatus = appointment.status as AppointmentStatus;

    const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
      WAITING:         ["IN_CONSULTATION", "CANCELLED"],
      IN_CONSULTATION: ["COMPLETED", "CANCELLED"],
      COMPLETED:       [],
      CANCELLED:       [],
    };

    if (!ALLOWED_TRANSITIONS[prevStatus].includes(status as AppointmentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot move appointment from "${prevStatus}" to "${status}".`,
      });
    }

    if (status === "COMPLETED" && prevStatus !== "COMPLETED") {
      await Doctor.findByIdAndUpdate(
        appointment.doctorId,
        { $inc: { pendingBalance: appointment.doctorPayout } }
      );
    }

    appointment.status = status as AppointmentStatus;
    if (linkedSaleId) appointment.linkedSaleId = linkedSaleId;
    await appointment.save();

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

// Fetch the available time slotd for a doctor.
export const getAvailableSlots = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req as any).user.pharmacyId;
    const { doctorId } = req.params;
    const { date } = req.query;

    if (!date || typeof date !== "string") {
      return res.status(400).json({ success: false, message: "date (YYYY-MM-DD) query param is required." });
    }

    const doctor = await Doctor.findOne({ _id: doctorId, pharmacyId, isActive: true });
    if (!doctor) {
      return res.status(404).json({ success: false, message: "Active doctor not found." });
    }

    const targetDate = parseDateLocal(date);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date format." });
    }

    const dayName  = getDayName(targetDate);
    const schedule = doctor.availability.find(
      (a: { dayOfWeek: string; startTime: string; endTime: string }) => a.dayOfWeek === dayName
    );

    if (!schedule) {
      return res.status(200).json({
        success: true,
        available: false,
        message: `Dr. ${doctor.name} does not work on ${dayName}s.`,
        slots: [],
      });
    }

    const avgTime   = doctor.avgConsultationTime ?? 15;
    const startMins = timeToMinutes(schedule.startTime);
    const endMins   = timeToMinutes(schedule.endTime);
    const allSlots: string[] = [];

    for (let m = startMins; m + avgTime <= endMins; m += avgTime) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      allSlots.push(`${hh}:${mm}`);
    }

    // Calculate current time in minutes only if selected date is today
    const now = new Date();
    const isToday =
      now.getFullYear() === targetDate.getFullYear() &&
      now.getMonth()    === targetDate.getMonth()    &&
      now.getDate()     === targetDate.getDate();
    const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : -1;

    const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await Appointment.find({
      doctorId,
      pharmacyId,
      status: { $in: ["WAITING", "IN_CONSULTATION"] },
      appointmentDate: { $gte: startOfDay, $lte: endOfDay },
    });

    const bookedMinutes = new Set(
      existingAppointments.map((a: { appointmentDate: Date }) => {
        const d = new Date(a.appointmentDate);
        return d.getHours() * 60 + d.getMinutes();
      })
    );

    const slots = allSlots.map((slot) => {
      const slotMins = timeToMinutes(slot);
      return {
        time:   slot,
        booked: bookedMinutes.has(slotMins),
        past:   nowMinutes >= 0 && slotMins <= nowMinutes,
      };
    });

    return res.status(200).json({
      success: true,
      available: true,
      dayName,
      schedule: { start: schedule.startTime, end: schedule.endTime },
      avgConsultationTime: avgTime,
      slots,
    });
  } catch (error: any) {
    console.error("[getAvailableSlots]", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Settle the pending balance for a doctor.
export const settleDoctorPayment = async (req: Request, res: Response) => {
  try {
    const pharmacyId   = (req as any).user.pharmacyId;
    const { doctorId } = req.params;
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