import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import upload from "../middlewares/multerMiddleware";

// Import controllers
import { 
  createDoctor, 
  getAllDoctors, 
  updateDoctor, 
  toggleDoctorStatus 
} from "../controller/doctorController";

import { 
  bookAppointment, 
  getDailyQueue, 
  updateAppointmentStatus, 
  settleDoctorPayment 
} from "../controller/appointmentController";

const router = Router();

// Apply your auth middleware to protect all routes in this file
router.use(authMiddleware);

// ==========================================
// DOCTOR ROUTES
// ==========================================
// Note: 'photo' matches the form-data key from the frontend
router.post("/doctors", upload.single("photo"), createDoctor);
router.get("/doctors", getAllDoctors);
router.put("/doctors/:id", upload.single("photo"), updateDoctor);
router.patch("/doctors/:id/toggle-status", toggleDoctorStatus);

// ==========================================
// APPOINTMENT / QUEUE ROUTES
// ==========================================
router.post("/appointments", bookAppointment);
router.get("/appointments/queue", getDailyQueue);
router.patch("/appointments/:appointmentId/status", updateAppointmentStatus);

// ==========================================
// LEDGER / PAYOUT ROUTES
// ==========================================
router.post("/doctors/:doctorId/settle", settleDoctorPayment);

export default router;