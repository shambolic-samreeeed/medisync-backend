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
import { addMedicineManually, getAllMedicines, uploadMedicineCSV } from "../controller/medicineController";
import { authMiddleware } from "../middlewares/authMiddleware";
import upload from "../middlewares/multerMiddleware";


const router = Router();

router.post("/upload-csv", authMiddleware, upload.single("file"), uploadMedicineCSV);
router.post("/manual", authMiddleware, addMedicineManually);
router.get("/", authMiddleware, getAllMedicines);

export default router;
