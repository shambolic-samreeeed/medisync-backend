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

router.get("/", authMiddleware, getAllPharmacies);
router.get("/:id", authMiddleware, getPharmacyById);

router.post("/", adminOnly, createPharmacy);
router.put("/:id", adminOnly, updatePharmacy);
router.delete("/:id",adminOnly, deletePharmacy);

router.put("/:id/plan", adminOnly, updatePharmacyPlan);
router.put("/:id/status", adminOnly, updatePharmacyStatus);

export default router;