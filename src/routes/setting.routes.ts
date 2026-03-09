import { Router } from "express";
import { generateEsewaSignature, getSettings, updateSettings } from "../controller/settingsController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// Protect both routes with your middleware
router.get("/", authMiddleware, getSettings);
router.put("/", authMiddleware, updateSettings);
router.post("/signature", authMiddleware, generateEsewaSignature);

export default router;