import { Router } from "express";
import { createSale, getRecentSales, getSalesStats } from "../controller/saleController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";

const router = Router();

router.use(authMiddleware, pharmacyGuard);

router.post("/",       createSale);
router.get("/recent",  getRecentSales);
router.get("/stats",   getSalesStats);

export default router;