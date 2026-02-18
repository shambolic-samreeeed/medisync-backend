import { Router } from "express";
import { getDashboardKPIs } from "src/controller/dashboardController";
import { authMiddleware } from "src/middlewares/authMiddleware";

const router = Router();

router.get("/kpis", authMiddleware, getDashboardKPIs);

export default router;
