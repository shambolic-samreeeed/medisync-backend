import { Router } from "express";
import {
  createPharmacy,
  getAllPharmacies,
  getPharmacyById,
  updatePharmacy,
  deletePharmacy,
  updatePharmacyStatus,
  updatePharmacyPlan,
  updatePharmacyPaymentStatus,
  updatePharmacySubscriptionManually,
} from "../controller/pharmacyController";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

router.post("/", authenticate, createPharmacy);
router.get("/", authenticate, getAllPharmacies);
router.get("/:id", authenticate, getPharmacyById);
router.put("/:id", authenticate, updatePharmacy);
router.delete("/:id", authenticate, deletePharmacy);

router.put("/:id/plan", authenticate, updatePharmacyPlan);

router.put("/:id/status", authenticate, updatePharmacyStatus);

router.put("/:id/payment-status", authenticate, updatePharmacyPaymentStatus);

router.put("/:id/subscription", authenticate, updatePharmacySubscriptionManually);


export default router;
