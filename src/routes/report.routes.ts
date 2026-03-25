import express from "express";
import { getKpiSummary } from "../controller/reportController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = express.Router();

router.get("/kpi", authMiddleware, getKpiSummary);

export default router;