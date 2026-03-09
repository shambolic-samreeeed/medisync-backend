import { Router } from "express";
import { getSettings, updateSettings } from "src/controller/settingsController";
import { authMiddleware } from "src/middlewares/authMiddleware";

const router = Router();

// Protect both routes with your middleware
router.get("/", authMiddleware, getSettings);
router.put("/", authMiddleware, updateSettings);

export default router;