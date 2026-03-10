// routes/settingsRoutes.ts
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { 
  getSettings, 
  updateSettings, 
  uploadQR, 
  deleteQR 
} from "../controller/settingsController"; // Adjust path if needed
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// ==========================================
// Multer Configuration for File Uploads
// ==========================================

// 1. Ensure the upload directory exists so it doesn't crash on the first upload
const uploadDir = "uploads/qrs";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 2. Configure where and how to save the image
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generates a unique filename like: 1710168345123-987654321.png
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for QR images
});

// ==========================================
// Routes
// ==========================================

// Get and Update basic keys
router.get("/", authMiddleware, getSettings);
router.put("/", authMiddleware, updateSettings);

// Add and Delete Custom QRs
// Notice how `uploadQR` is passed AFTER the multer middleware
router.post("/qr", authMiddleware, upload.single("qrImage"), uploadQR);
router.delete("/qr/:provider", authMiddleware, deleteQR);

export default router;