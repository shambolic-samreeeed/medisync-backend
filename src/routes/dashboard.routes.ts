import { Router } from "express";
import {
  getDashboardKPIs,
  getInventoryAlerts,
  getInventoryAlertsSummary,
  getSalesTrend,
  getTopSellingMedicines,
} from "../controller/dashboardController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";

const router = Router();

// SECURITY: pharmacyGuard enforces tenant isolation — every request must
// have a valid pharmacyId, blocking cross-pharmacy data access at the
// middleware level before any controller query runs.
router.use(authMiddleware, pharmacyGuard);

router.get("/kpis", getDashboardKPIs);
router.get("/sales-trend", getSalesTrend);
router.get("/inventory-alerts", getInventoryAlerts);
router.get("/inventory-alerts/summary", getInventoryAlertsSummary);
router.get("/top-selling-medicines", getTopSellingMedicines);

export default router;