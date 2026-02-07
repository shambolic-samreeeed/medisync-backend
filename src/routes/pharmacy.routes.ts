import { Router } from "express";
import {
  createPharmacy,
  getAllPharmacies,
  getPharmacyById,
  updatePharmacy,
  deletePharmacy,
} from "../controller/pharmacyController";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

router.post("/", authenticate, createPharmacy);
router.get("/", authenticate, getAllPharmacies);
router.get("/:id", authenticate, getPharmacyById);
router.put("/:id", authenticate, updatePharmacy);
router.delete("/:id", authenticate, deletePharmacy);

export default router;
