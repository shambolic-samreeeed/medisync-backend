/**
 * @file routes/supplierRoutes.ts
 * @description Supplier routes for MediSync.
 */

import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";
import {
  createSupplier,
  deleteSupplier,
  getSupplierById,
  getSuppliers,
  updateSupplier,
} from "../controller/supplierController";
import { getSupplierPurchases } from "../controller/purchaseController";

const router = Router();

// SECURITY: pharmacyGuard ensures all supplier data is tenant-isolated
router.use(authMiddleware, pharmacyGuard);

router.post("/", createSupplier);
router.get("/", getSuppliers);
router.get("/:id", getSupplierById);
router.put("/:id", updateSupplier);
router.delete("/:id", deleteSupplier);

router.get("/:supplierId/purchases", getSupplierPurchases);

export default router;