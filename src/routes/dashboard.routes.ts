import { Router } from "express";
import { getDashboardStats } from "../controller/dashboardController";

const router = Router();

// GET /api/dashboard
router.get("/", getDashboardStats);

export default router;
