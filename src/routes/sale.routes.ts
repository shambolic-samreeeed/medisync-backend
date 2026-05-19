// FILE: src/routes/sale.routes.ts
// Replace your existing file.

import { Router } from "express";
import { createSale, getRecentSales, getSalesStats, getSaleById } from "../controller/saleController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";

const router = Router();

router.use(authMiddleware, pharmacyGuard);

router.post("/",        createSale);
router.get("/recent",   getRecentSales);
router.get("/stats",    getSalesStats);
router.get("/:id",      getSaleById);  

export default router;