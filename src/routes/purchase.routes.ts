import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { 
  getPurchaseById, 
  getAllPurchases, 
  updatePurchasePayment 
} from "../controller/purchaseController";

const router = Router();

/**
 * @route   GET /api/purchases
 * @desc    Fetch all purchase invoices for the pharmacy dashboard
 * @access  Private
 */
router.get("/", authMiddleware, getAllPurchases);

/**
 * @route   GET /api/purchases/:purchaseId
 * @desc    Fetch full details of a single invoice (items, totals, etc.)
 * @access  Private
 */
router.get("/:purchaseId", authMiddleware, getPurchaseById);

/**
 * @route   PATCH /api/purchases/:purchaseId/payment
 * @desc    Update paid amount and payment status (UNPAID -> PARTIAL -> PAID)
 * @access  Private
 */
router.patch("/:purchaseId/payment", authMiddleware, updatePurchasePayment);

export default router;