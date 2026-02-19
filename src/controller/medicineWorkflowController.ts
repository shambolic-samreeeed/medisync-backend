// src/controllers/medicineWorkflow.controller.ts
import { Request, Response } from "express";
import mongoose from "mongoose";
import Medicine from "../models/Medicine";

type POSStatus = "ACTIVE" | "BLOCKED";

function asObjectId(id: any) {
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

/**
 * POST /api/medicines/:id/block-pos
 * Blocks a specific batch document from being shown/sold in POS.
 * Does NOT change stock.
 *
 * Auth: uses req.user.pharmacyId
 */
export const blockMedicineFromPOS = async (req: Request, res: Response) => {
  try {
    const pharmacyIdRaw = (req.user as any)?.pharmacyId;
    if (!pharmacyIdRaw) return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });

    const pharmacyId = asObjectId(pharmacyIdRaw) ?? pharmacyIdRaw;

    const med = await Medicine.findOne({ _id: req.params.id, pharmacyId });
    if (!med) return res.status(404).json({ message: "Medicine batch not found" });

    // Backward-compatible: if fields not present in DB yet, they can still be set
    if ((med as any).isDisposed === true) {
      return res.status(400).json({ message: "This batch is already disposed" });
    }

    (med as any).posStatus = "BLOCKED" as POSStatus;
    await med.save();

    return res.json({
      message: "Batch blocked from POS",
      data: {
        _id: med._id,
        medicineId: (med as any).medicineId,
        name: (med as any).name,
        batchNo: (med as any).batchNo,
        posStatus: (med as any).posStatus,
      },
    });
  } catch (err: any) {
    console.error("blockMedicineFromPOS error:", err);
    return res.status(500).json({
      message: "Failed to block batch from POS",
      error: err?.message || String(err),
    });
  }
};

/**
 * POST /api/medicines/:id/unblock-pos
 * Optional: unblocks a batch back to POS (if not disposed).
 */
export const unblockMedicineFromPOS = async (req: Request, res: Response) => {
  try {
    const pharmacyIdRaw = (req.user as any)?.pharmacyId;
    if (!pharmacyIdRaw) return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });

    const pharmacyId = asObjectId(pharmacyIdRaw) ?? pharmacyIdRaw;

    const med = await Medicine.findOne({ _id: req.params.id, pharmacyId });
    if (!med) return res.status(404).json({ message: "Medicine batch not found" });

    if ((med as any).isDisposed === true) {
      return res.status(400).json({ message: "This batch is disposed; cannot unblock" });
    }

    (med as any).posStatus = "ACTIVE" as POSStatus;
    await med.save();

    return res.json({
      message: "Batch unblocked for POS",
      data: {
        _id: med._id,
        medicineId: (med as any).medicineId,
        name: (med as any).name,
        batchNo: (med as any).batchNo,
        posStatus: (med as any).posStatus,
      },
    });
  } catch (err: any) {
    console.error("unblockMedicineFromPOS error:", err);
    return res.status(500).json({
      message: "Failed to unblock batch for POS",
      error: err?.message || String(err),
    });
  }
};

/**
 * POST /api/medicines/:id/dispose
 * After pharmacist physically removes stock, reflect it in app.
 *
 * body:
 * - disposeAll?: boolean  (if true -> stock becomes 0)
 * - qty?: number         (otherwise subtract qty)
 * - note?: string
 *
 * Behavior:
 * - subtracts stock safely (never below 0)
 * - if stock becomes 0: marks isDisposed=true, sets disposedAt/disposedBy/note, and blocks from POS
 *
 * NOTE: This endpoint is intentionally NOT "expired-only" so you can also dispose damaged/returned stock.
 * If you want expired-only, tell me and I’ll add the expiry check.
 */
export const disposeMedicineBatch = async (req: Request, res: Response) => {
  try {
    const pharmacyIdRaw = (req.user as any)?.pharmacyId;
    const userIdRaw = (req.user as any)?._id;

    if (!pharmacyIdRaw) return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });

    const pharmacyId = asObjectId(pharmacyIdRaw) ?? pharmacyIdRaw;

    const { disposeAll, qty, note } = (req.body ?? {}) as {
      disposeAll?: boolean;
      qty?: number;
      note?: string;
    };

    const med = await Medicine.findOne({ _id: req.params.id, pharmacyId });
    if (!med) return res.status(404).json({ message: "Medicine batch not found" });

    const currentStock = Number((med as any).stock ?? 0);
    if (currentStock <= 0) {
      return res.status(400).json({ message: "Stock is already 0" });
    }

    const removeQty = disposeAll ? currentStock : Number(qty ?? 0);
    if (!removeQty || removeQty <= 0) {
      return res.status(400).json({ message: "qty must be > 0, or set disposeAll=true" });
    }
    if (removeQty > currentStock) {
      return res.status(400).json({ message: "qty cannot exceed current stock" });
    }

    (med as any).stock = currentStock - removeQty;

    // If fully removed => mark disposed + keep blocked from POS
    if (Number((med as any).stock) === 0) {
      (med as any).isDisposed = true;
      (med as any).disposedAt = new Date();
      (med as any).disposedBy = userIdRaw;
      (med as any).disposeNote = note;
      (med as any).posStatus = "BLOCKED" as POSStatus;
    }

    await med.save();

    return res.json({
      message: "Batch disposed successfully",
      data: {
        _id: med._id,
        medicineId: (med as any).medicineId,
        name: (med as any).name,
        batchNo: (med as any).batchNo,
        removedQty: removeQty,
        newStock: (med as any).stock,
        posStatus: (med as any).posStatus ?? "ACTIVE",
        isDisposed: (med as any).isDisposed ?? false,
        disposedAt: (med as any).disposedAt ?? null,
        disposeNote: (med as any).disposeNote ?? null,
      },
    });
  } catch (err: any) {
    console.error("disposeMedicineBatch error:", err);
    return res.status(500).json({
      message: "Failed to dispose batch stock",
      error: err?.message || String(err),
    });
  }
};
