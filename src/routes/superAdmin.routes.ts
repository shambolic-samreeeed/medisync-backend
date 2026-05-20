import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { adminOnly } from "../middlewares/adminsOnly";
import {
  getDashboardStats, getRevenue,
  listPharmacies, getPharmacyDetail,
  adminCreatePharmacy, adminUpdatePharmacy, adminDeletePharmacy,
  suspendPharmacy, reactivatePharmacy, cancelPharmacy,
  getPharmacySubscriptionAdmin, adminActivateSubscription, extendTrial,
  listUsers, adminDeleteUser,
  listPlans, updatePlan,
  listPayments,
} from "../controller/superAdminController";

const router = Router();
router.use(authMiddleware, adminOnly);

// Dashboard & Revenue
router.get("/dashboard", getDashboardStats);
router.get("/revenue",   getRevenue);

// Plans
router.get("/plans",       listPlans);
router.put("/plans/:tier", updatePlan);

// Platform-wide payments
router.get("/payments", listPayments);

// Users
router.get("/users",            listUsers);
router.delete("/users/:userId", adminDeleteUser);

// Pharmacies
router.get("/pharmacies",        listPharmacies);
router.post("/pharmacies",       adminCreatePharmacy);
router.get("/pharmacies/:id",    getPharmacyDetail);
router.put("/pharmacies/:id",    adminUpdatePharmacy);
router.delete("/pharmacies/:id", adminDeletePharmacy);

// Pharmacy status actions
router.put("/pharmacies/:id/suspend",    suspendPharmacy);
router.put("/pharmacies/:id/reactivate", reactivatePharmacy);
router.put("/pharmacies/:id/cancel",     cancelPharmacy);

// Subscriptions
router.get("/pharmacies/:id/subscription",                 getPharmacySubscriptionAdmin);
router.post("/pharmacies/:id/subscription/activate",       adminActivateSubscription);
router.post("/pharmacies/:id/subscription/extend-trial",   extendTrial);

export default router;