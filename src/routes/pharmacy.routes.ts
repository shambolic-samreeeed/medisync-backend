import { Router } from "express";
import {
  createPharmacy,
  getAllPharmacies,
  getPharmacyById,
  updatePharmacy,
  deletePharmacy,
} from "../controller/pharmacyController";
import { adminOnly } from "src/middlewares/adminsOnly";

const router = Router();

router.post("/", adminOnly, createPharmacy);
router.get("/", adminOnly, getAllPharmacies);
router.get("/:id", adminOnly, getPharmacyById);
router.put("/:id", adminOnly, updatePharmacy);
router.delete("/:id", adminOnly, deletePharmacy);

export default router;
