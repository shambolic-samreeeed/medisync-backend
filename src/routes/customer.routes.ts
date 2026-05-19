// FILE: src/routes/customer.routes.ts
// Replace your existing file entirely.

import { Router } from "express";
import {
  createCustomer,
  deleteCustomer,
  getCustomerById,
  getCustomers,
  updateCustomer,
  getCustomerStats,
  getCustomerTransactions,
} from "../controller/customerController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";

const router = Router();

router.use(authMiddleware, pharmacyGuard);

// ── Static routes first (must come before /:id to avoid route collision) ──────
router.get("/stats", getCustomerStats);

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.post("/",    createCustomer);
router.get("/",     getCustomers);
router.get("/:id",  getCustomerById);
router.put("/:id",  updateCustomer);
router.delete("/:id", deleteCustomer);

// ── Customer-specific sub-resources ──────────────────────────────────────────
router.get("/:id/transactions", getCustomerTransactions);

export default router;