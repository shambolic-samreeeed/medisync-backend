import express from "express";
import { getDashboardReport } from "../controller/reportController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";

const router = express.Router();

/**
 * @route   GET /api/reports/dashboard
 * @desc    Get all-in-one financial analytics (KPIs, Sales Trend, Payments, Top Products)
 * @access  Private (Pharmacy-scoped — pharmacyGuard enforces tenant isolation)
 */
router.get("/dashboard", authMiddleware, pharmacyGuard, getDashboardReport);

export default router;