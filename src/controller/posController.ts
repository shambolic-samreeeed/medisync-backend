import { Request, Response } from "express";
import Medicine from "../models/Medicine";

const DASH_TZ = "Asia/Kathmandu";

function dateKeyInTZ(d: Date, timeZone = DASH_TZ) {
  return d.toLocaleDateString("en-CA", { timeZone });
}
function startOfDayInTZ(date = new Date(), timeZone = DASH_TZ) {
  const key = dateKeyInTZ(date, timeZone);
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * GET /api/pos/medicines
 * Only sellable medicines for POS
 */
export const getSellableMedicinesForPOS = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const todayStartNepal = startOfDayInTZ(new Date(), DASH_TZ);

    const medicines = await Medicine.find({
      pharmacyId,
      stock: { $gt: 0 },
      posStatus: "ACTIVE",
      isDisposed: false,
      expiryDate: { $gte: todayStartNepal },
    })
      .sort({ expiryDate: 1 }) // FEFO: sell nearest expiry first
      .select("medicineId name batchNo stock unitPrice expiryDate");

    return res.status(200).json(medicines);
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to load POS medicines",
      error: error.message,
    });
  }
};
