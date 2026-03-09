import { Router } from "express";
import { initiateKhaltiPayment } from "../controller/khaltiController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// Endpoint: POST /api/khalti/initiate
// Protected by your auth middleware so only logged-in pharmacists can create payment links
router.post("/initiate", authMiddleware, initiateKhaltiPayment);

export default router;