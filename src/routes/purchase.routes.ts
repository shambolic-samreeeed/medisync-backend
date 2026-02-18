import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { getPurchaseById } from "../controller/purchaseController";

const router = Router();

// GET /api/purchases/:purchaseId
router.get("/:purchaseId", authMiddleware, getPurchaseById);

export default router;
