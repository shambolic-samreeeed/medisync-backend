import { Router } from "express";
import { getDashboardKPIs } from "../controller/dashboardController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.get("/kpis", authMiddleware, getDashboardKPIs);

export default router;
