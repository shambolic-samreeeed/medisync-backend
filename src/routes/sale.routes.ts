import { Router } from "express";
import { createSale } from "../controller/saleController";

const router = Router();

// Record a sale
router.post("/", createSale);

export default router;
