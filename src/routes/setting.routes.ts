// routes/settingsRoutes.ts
import { Router } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

import { 
  getSettings, 
  updateSettings, 
  uploadQR, 
  deleteQR 
} from "../controller/settingsController"; // Adjust path if needed
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// ==========================================
// Cloudinary & Multer Configuration
// ==========================================

// 1. Configure Cloudinary with your Render/Local .env variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Tell Multer to send files directly to your Cloudinary account
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "medisync-qrs", // This will create a neat folder in your Cloudinary dashboard
    allowed_formats: ["jpg", "png", "jpeg", "webp"], // Only allow images
  } as any, // Added 'as any' to prevent strict TypeScript errors on the params object
});

// 3. Initialize Multer with the Cloudinary storage and a 5MB size limit
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } 
});

// ==========================================
// Routes
// ==========================================

// Get and Update basic keys
router.get("/", authMiddleware, getSettings);
router.put("/", authMiddleware, updateSettings);

// Add and Delete Custom QRs
// 🚀 MAGIC: `upload.single` now automatically intercepts the image, sends it to 
// Cloudinary, and puts the new permanent URL into `req.file.path` before calling `uploadQR`!
router.post("/qr", authMiddleware, upload.single("qrImage"), uploadQR);
router.delete("/qr/:provider", authMiddleware, deleteQR);

export default router;