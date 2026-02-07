import { Router } from "express";
import { createSale } from "src/controller/saleController";

const router = Router();

// Record a sale
router.post("/", createSale);

export default router;
