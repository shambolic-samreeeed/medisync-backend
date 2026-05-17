// routes/settingsRoutes.ts
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
import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";

const router = Router();

// Cloudinary & Multer Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "medisync-qrs",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  } as any,
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// SECURITY: pharmacyGuard ensures settings are always scoped to the correct pharmacy
router.use(authMiddleware, pharmacyGuard);

router.get("/", getSettings);
router.put("/", updateSettings);
router.post("/qr", upload.single("qrImage"), uploadQR);
router.delete("/qr/:provider", deleteQR);

export default router;