/**
 * @file src/routes/superAdmin.routes.ts
 * @description All super-admin routes. Every route requires ADMIN role.
 */
import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { adminOnly } from "../middlewares/adminsOnly";
import {
  getDashboardStats,
  listPharmacies,
  getPharmacyDetail,
  adminCreatePharmacy,
  suspendPharmacy,
  reactivatePharmacy,
  cancelPharmacy,
  adminActivateSubscription,
  getPharmacySubscriptionAdmin,
  listUsers,
  adminDeleteUser,
  listPlans,
  updatePlan,
  getRevenue,
} from "../controller/superAdminController";

const router = Router();

// All routes require auth + admin role
router.use(authMiddleware, adminOnly);

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get("/dashboard", getDashboardStats);
router.get("/revenue", getRevenue);

// ── Plans ────────────────────────────────────────────────────────────────────
router.get("/plans", listPlans);
router.put("/plans/:tier", updatePlan);

// ── Users (staff) ────────────────────────────────────────────────────────────
router.get("/users", listUsers);
router.delete("/users/:userId", adminDeleteUser);

// ── Pharmacies ───────────────────────────────────────────────────────────────
router.get("/pharmacies", listPharmacies);
router.post("/pharmacies", adminCreatePharmacy);
router.get("/pharmacies/:id", getPharmacyDetail);
router.put("/pharmacies/:id/suspend", suspendPharmacy);
router.put("/pharmacies/:id/reactivate", reactivatePharmacy);
router.put("/pharmacies/:id/cancel", cancelPharmacy);

// ── Subscriptions ────────────────────────────────────────────────────────────
router.get("/pharmacies/:id/subscription", getPharmacySubscriptionAdmin);
router.post("/pharmacies/:id/subscription/activate", adminActivateSubscription);

export default router;
