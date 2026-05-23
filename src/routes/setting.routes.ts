// FILE: src/routes/setting.routes.ts

import { Router } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

import {
  getSettings,
  updateSettings,
  uploadQR,
  deleteQR,
} from "../controller/settingsController";

import {
  getEmailSettings,
  updateEmailSettings,
  sendTestEmail,
} from "../controller/emailSettingsController";

import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";

const router = Router();

// ─── Cloudinary & Multer for QR uploads ──────────────────────────────────────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "medisync-qrs",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  } as any,
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ─── Auth gate: all /api/setting routes require auth + pharmacy membership ───

router.use(authMiddleware, pharmacyGuard);

// ─── Payment / QR settings ───────────────────────────────────────────────────

router.get("/",    getSettings);
router.put("/",    updateSettings);
router.post("/qr", upload.single("qrImage"), uploadQR);
router.delete("/qr/:provider", deleteQR);

// ─── Email / SMTP settings (new multi-tenant endpoints) ──────────────────────

/**
 * GET  /api/setting/email          → Fetch SMTP config (password redacted)
 * PUT  /api/setting/email          → Save / update SMTP config
 * POST /api/setting/email/test     → Verify connection & send test email
 */
router.get("/email",       getEmailSettings);
router.put("/email",       updateEmailSettings);
router.post("/email/test", sendTestEmail);

export default router;
