import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";
import {
  getPurchaseById,
  getAllPurchases,
  updatePurchasePayment,
} from "../controller/purchaseController";

const router = Router();

// SECURITY: pharmacyGuard enforces tenant isolation for all purchase endpoints
router.use(authMiddleware, pharmacyGuard);

router.get("/", getAllPurchases);
router.get("/:purchaseId", getPurchaseById);
router.patch("/:purchaseId/payment", updatePurchasePayment);

export default router;