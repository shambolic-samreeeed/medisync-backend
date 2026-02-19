import { Router } from "express";
import { getDashboardKPIs, getInventoryAlerts, getInventoryAlertsSummary, getSalesTrend } from "../controller/dashboardController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.get("/kpis", authMiddleware, getDashboardKPIs);

router.get("/sales-trend", authMiddleware, getSalesTrend);

router.get("/inventory-alerts", authMiddleware, getInventoryAlerts);

router.get("/inventory-alerts/summary", authMiddleware, getInventoryAlertsSummary)
export default router;
