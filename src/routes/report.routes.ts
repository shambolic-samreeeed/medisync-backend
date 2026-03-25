import express from "express";
import { getDashboardReport } from "../controller/reportController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = express.Router();

/**
 * @route   GET /api/reports/dashboard
 * @desc    Get all-in-one financial analytics (KPIs, Sales Trend, Payments, Top Products)
 * @access  Private (Pharmacy Admin Only)
 */
router.get("/dashboard", authMiddleware, getDashboardReport);

export default router;