// FILE: src/controller/medicineWorkflowController.ts
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: Only the disposeMedicineBatch function's email call has changed:
//  - pharmacyId is now passed to sendBatchDisposalAlert() for multi-tenant SMTP.
//  All other logic is UNCHANGED from the original.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import mongoose from "mongoose";
import Batch from "../models/Batch";
import ProductMedicine from "../models/ProductMedicine";
import Pharmacy from "../models/Pharmacy";
import { User } from "../models/User";
import { sendBatchDisposalAlert } from "../utils/emailService";

/**
 * POST /api/medicines/:id/block-pos
 * Note: :id is a BATCH id. Blocks a specific batch from POS without changing stock.
 */
export const blockMedicineFromPOS = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized" });

    const batch = await Batch.findOneAndUpdate(
      { _id: req.params.id, pharmacyId, status: "ACTIVE" },
      { $set: { status: "BLOCKED" } },
      { new: true }
    );
    if (!batch) return res.status(404).json({ message: "Active batch not found" });

    return res.json({ message: "Batch blocked from POS", data: batch });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/medicines/:id/unblock-pos
 */
export const unblockMedicineFromPOS = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized" });

    const batch = await Batch.findOne({ _id: req.params.id, pharmacyId, status: "BLOCKED" });
    if (!batch) return res.status(404).json({ message: "Blocked batch not found" });

    batch.status = batch.currentQuantity > 0 ? "ACTIVE" : "DEPLETED";
    await batch.save();

    return res.json({ message: "Batch unblocked", data: batch });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/medicines/:id/dispose
 * Dispose a specific batch (full or partial).
 *
 * body:
 *  - disposeAll?: boolean
 *  - qty?: number
 *  - reason?: "EXPIRED" | "DAMAGED" | "RECALLED" | "OTHER"
 *  - note?: string
 */
export const disposeMedicineBatch = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const pharmacyId = req.user?.pharmacyId;
    const userId = req.user?._id;
    if (!pharmacyId) throw new Error("Unauthorized");

    const { disposeAll = false, qty, reason = "OTHER", note } = req.body ?? {};

    const batch = await Batch.findOne({ _id: req.params.id, pharmacyId }).session(session);
    if (!batch) throw new Error("Batch not found");
    if (batch.status === "DISPOSED") throw new Error("Batch is already fully disposed");

    const removeQty = disposeAll ? batch.currentQuantity : Number(qty ?? 0);
    if (!removeQty || removeQty <= 0) throw new Error("qty must be > 0, or set disposeAll=true");
    if (removeQty > batch.currentQuantity) throw new Error("qty cannot exceed current stock");

    batch.currentQuantity -= removeQty;
    batch.disposedQuantity += removeQty;
    batch.disposalEvents.push({
      quantity: removeQty,
      reason,
      disposedAt: new Date(),
      disposedBy: userId as any,
      note,
    } as any);

    if (batch.currentQuantity === 0) batch.status = "DISPOSED";

    await batch.save({ session });
    await session.commitTransaction();
    session.endSession();

    // ── Async: send disposal email using pharmacy's own SMTP ─────────────────
    Promise.all([
      Pharmacy.findById(pharmacyId).select("name email").lean(),
      ProductMedicine.findById(batch.productId).select("brandName").lean(),
      User.findById(userId).select("firstName lastName").lean(),
    ])
      .then(([pharmacy, product, disposedByUser]) => {
        if (!pharmacy?.email) return;
        const disposedByName = disposedByUser
          ? `${(disposedByUser as any).firstName} ${(disposedByUser as any).lastName}`
          : "Staff";

        sendBatchDisposalAlert({
          pharmacyId: String(pharmacyId),  // ← multi-tenant: determines which SMTP to use
          pharmacyEmail: pharmacy.email,
          pharmacyName: pharmacy.name,
          batches: [
            {
              productName: (product as any)?.brandName ?? "Unknown Product",
              batchNumber: batch.batchNumber,
              disposedQuantity: removeQty,
              reason,
              disposedBy: disposedByName,
              note,
            },
          ],
        }).catch((emailErr: any) => {
          if (emailErr.message?.includes("No email configuration") || emailErr.message?.includes("incomplete SMTP")) {
            console.warn(`[Email] Disposal alert skipped for pharmacy ${pharmacyId} — SMTP not configured.`);
          } else {
            console.error("[Email] Disposal alert failed:", emailErr.message);
          }
        });
      })
      .catch(console.error);

    return res.json({
      message: "Batch disposed",
      data: {
        batchId: batch._id,
        removedQty: removeQty,
        currentQuantity: batch.currentQuantity,
        status: batch.status,
        disposedAt: new Date(),
      },
    });
  } catch (err: any) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ message: err.message });
  }
};
