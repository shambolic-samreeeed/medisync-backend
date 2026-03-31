import { Router } from "express";
import {
  createPharmacy,
  getAllPharmacies,
  getPharmacyById,
  updatePharmacy,
  deletePharmacy,
  updatePharmacyPlan,
  updatePharmacyStatus,
} from "../controller/pharmacyController";

import { authMiddleware } from "../middlewares/authMiddleware";
import { adminOnly } from "../middlewares/adminsOnly";

const router = Router();

/**
 * 📦 Public (Authenticated users)
 */
router.get("/", authMiddleware, getAllPharmacies);
router.get("/:id", authMiddleware, getPharmacyById);

/**
 * 🔒 Admin Only
 */
router.post("/", authMiddleware, adminOnly, createPharmacy);
router.put("/:id", authMiddleware, adminOnly, updatePharmacy);
router.delete("/:id", authMiddleware, adminOnly, deletePharmacy);

router.put("/:id/plan", authMiddleware, adminOnly, updatePharmacyPlan);
router.put("/:id/status", authMiddleware, adminOnly, updatePharmacyStatus);

export default router;