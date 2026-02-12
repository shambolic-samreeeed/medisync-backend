/**
 * @file routes/supplierRoutes.ts
 * @description
 * Supplier routes for MediSync.
 */

import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import {
  createSupplier,
  deleteSupplier,
  getSupplierById,
  getSuppliers,
  updateSupplier,
} from "../controller/supplierController";

import { getSupplierPurchases } from "../controller/purchaseController";

const router = Router();

router.post("/", authMiddleware, createSupplier);
router.get("/", authMiddleware, getSuppliers);
router.get("/:id", authMiddleware, getSupplierById);
router.put("/:id", authMiddleware, updateSupplier);
router.delete("/:id", authMiddleware, deleteSupplier);

router.get("/:supplierId/purchases", authMiddleware, getSupplierPurchases);

export default router;
