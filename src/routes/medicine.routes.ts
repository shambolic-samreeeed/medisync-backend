/**
 * @file routes/medicineRoutes.ts
 * @description
 * Medicine routes for MediSync.
 *
 * IMPORTANT:
 * - authMiddleware must run before controllers so req.user.pharmacyId exists.
 * - upload.single("file") must match Postman form-data key = "file"
 */

import { Router } from "express";
import { addMedicineManually, getAllMedicines, uploadMedicineCSV } from "src/controller/medicineController";
import { authMiddleware } from "src/middlewares/authMiddleware";
import upload from "src/middlewares/multerMiddleware";

const router = Router();

router.post("/upload-csv", authMiddleware, upload.single("file"), uploadMedicineCSV);
router.post("/manual", authMiddleware, addMedicineManually);
router.get("/", authMiddleware, getAllMedicines);

export default router;
