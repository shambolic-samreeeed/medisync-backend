import { Router } from "express";
import { getDashboardKPIs, getSalesTrend } from "../controller/dashboardController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.get("/kpis", authMiddleware, getDashboardKPIs);
router.get("/sales-trend", authMiddleware, getSalesTrend);

export default router;
