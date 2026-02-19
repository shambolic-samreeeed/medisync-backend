// src/controllers/posController.ts
import { Request, Response } from "express";
import Medicine from "../models/Medicine";

const DASH_TZ = "Asia/Kathmandu";

// "YYYY-MM-DD" in Nepal timezone
function dateKeyInTZ(d: Date, timeZone = DASH_TZ) {
  return d.toLocaleDateString("en-CA", { timeZone });
}

// Start of Nepal day as a stable UTC Date boundary for Mongo comparisons
function startOfDayInTZ(date = new Date(), timeZone = DASH_TZ) {
  const key = dateKeyInTZ(date, timeZone);
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * GET /api/pos/medicines
 *  Returns only sellable batches for POS
 *
 * Filters:
 * - pharmacyId from req.user
 * - stock > 0
 * - posStatus is ACTIVE OR missing (backward compatible)
 * - isDisposed !== true (missing treated as false)
 * - not expired: expiryDate >= todayStartNepal (valid for full day in Nepal)
 *
 * Sorted:
 * - expiryDate asc (FEFO)
 */
export const getSellableMedicinesForPOS = async (req: Request, res: Response) => {
  try {
    const pharmacyId = (req.user as any)?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const todayStartNepal = startOfDayInTZ(new Date(), DASH_TZ);

    const medicines = await Medicine.find({
      pharmacyId,
      stock: { $gt: 0 },

      $or: [{ posStatus: "ACTIVE" }, { posStatus: { $exists: false } }],

      isDisposed: { $ne: true },
      expiryDate: { $gte: todayStartNepal },
    })
      .sort({ expiryDate: 1, name: 1 }) 
      .select("medicineId name brand category batchNo stock reorderLevel unit unitPrice expiryDate barcode");

    return res.status(200).json(medicines);
  } catch (error: any) {
    console.error("getSellableMedicinesForPOS error:", error);
    return res.status(500).json({
      message: "Failed to load POS medicines",
      error: error?.message || String(error),
    });
  }
};
