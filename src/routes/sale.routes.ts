import { Router } from "express";
import { createSale } from "../controller/saleController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// Record a sale
router.post("/", authMiddleware, createSale);

export default router;
