/**
 * @file routes/medicineRoutes.ts
 * @description
 * Medicine routes for MediSync.
 *
 * IMPORTANT:
 * - authMiddleware MUST run before controllers so req.user.pharmacyId exists.
 * - upload.single("file") means Postman key must be: file
 */

import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import upload from "../middlewares/multerMiddleware";
import {
  addMedicineManually,
  getAllMedicines,
  updateMedicinePrices,
  uploadMedicineCSV,
} from "../controller/medicineController"; 
import { blockMedicineFromPOS, disposeMedicineBatch, unblockMedicineFromPOS } from "../controller/medicineWorkflowController";

const router = Router();

/**
 * POST /api/medicines/upload-csv
 * multipart/form-data:
 * - file (CSV) (key must be "file")
 * - supplierId (required)
 * - invoiceNumber (required)
 * - purchaseDate (optional)
 */
router.post("/upload-csv", authMiddleware, upload.single("file"), uploadMedicineCSV);

router.post("/manual", authMiddleware, addMedicineManually);
router.get("/", authMiddleware, getAllMedicines);

router.post("/:id/block-pos", authMiddleware, blockMedicineFromPOS);
router.post("/:id/unblock-pos", authMiddleware, unblockMedicineFromPOS); 
router.post("/:id/dispose", authMiddleware, disposeMedicineBatch);
router.put("/:id/prices", authMiddleware, updateMedicinePrices);

export default router;
