import { Router } from "express";
import { getDashboardStats, getTodayStats } from "../controller/dashboardController";

const router = Router();

// GET /api/dashboard
router.get("/", getDashboardStats);

//get todays stat
router.get("/today", getTodayStats);

export default router;
