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
} from "../controllers/supplierController";

const router = Router();

router.post("/", authMiddleware, createSupplier);
router.get("/", authMiddleware, getSuppliers);
router.get("/:id", authMiddleware, getSupplierById);
router.put("/:id", authMiddleware, updateSupplier);
router.delete("/:id", authMiddleware, deleteSupplier);

export default router;
