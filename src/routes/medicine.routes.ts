/**
 * @file routes/medicineRoutes.ts
 * @description Medicine routes for MediSync.
 *
 * SECURITY:
 * - authMiddleware loads req.user.pharmacyId fresh from DB on every request.
 * - pharmacyGuard rejects requests with no pharmacyId (prevents cross-pharmacy access).
 */

import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";
import upload from "../middlewares/multerMiddleware";
import {
  addMedicineManually,
  getAllMedicines,
  updateMedicinePrices,
  uploadMedicineCSV,
} from "../controller/medicineController";
import {
  blockMedicineFromPOS,
  disposeMedicineBatch,
  unblockMedicineFromPOS,
} from "../controller/medicineWorkflowController";

const router = Router();

// Apply auth + tenant guard to all medicine routes
router.use(authMiddleware, pharmacyGuard);

router.post("/upload-csv", upload.single("file"), uploadMedicineCSV);
router.post("/manual", addMedicineManually);
router.get("/", getAllMedicines);

router.post("/:id/block-pos", blockMedicineFromPOS);
router.post("/:id/unblock-pos", unblockMedicineFromPOS);
router.post("/:id/dispose", disposeMedicineBatch);
router.put("/:id/prices", updateMedicinePrices);

export default router;