import express from "express";
import { getKpiSummary } from "src/controller/reportController";
import { authMiddleware } from "src/middlewares/authMiddleware";

const router = express.Router();

// Get top-level KPI stats
router.get("/kpi", authMiddleware, getKpiSummary);

export default router;