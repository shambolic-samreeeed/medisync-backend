import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";
import upload from "../middlewares/multerMiddleware";

import {
  createDoctor,
  getAllDoctors,
  getDoctorById,
  updateDoctor,
  toggleDoctorStatus,
  deleteDoctor,
} from "../controller/doctorController";

import {
  bookAppointment,
  getDailyQueue,
  updateAppointmentStatus,
  getAvailableSlots,
  settleDoctorPayment,
} from "../controller/appointmentController";

import { requireFeature } from "../middlewares/featureGuard";

const router = Router();

router.use(authMiddleware, pharmacyGuard, requireFeature("clinicModule"));

// DOCTOR ROUTES
router.post("/doctors", upload.single("photo"), createDoctor);
router.get("/doctors", getAllDoctors);
router.get("/doctors/:id", getDoctorById);
router.put("/doctors/:id", upload.single("photo"), updateDoctor);
router.patch("/doctors/:id/toggle-status", toggleDoctorStatus);
router.delete("/doctors/:id", deleteDoctor);

// SLOTS
router.get("/doctors/:doctorId/slots", getAvailableSlots);

// APPOINTMENT / QUEUE ROUTES
router.post("/appointments", bookAppointment);
router.get("/appointments/queue", getDailyQueue);
router.patch("/appointments/:appointmentId/status", updateAppointmentStatus);

// LEDGER / PAYOUT ROUTES
router.post("/doctors/:doctorId/settle", settleDoctorPayment);

export default router;