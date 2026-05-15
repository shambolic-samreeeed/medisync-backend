// // src/controllers/medicineWorkflow.controller.ts
// import { Request, Response } from "express";
// import mongoose from "mongoose";
// import Medicine from "../models/Medicine";

// type POSStatus = "ACTIVE" | "BLOCKED";

// function asObjectId(id: any) {
//   try {
//     return new mongoose.Types.ObjectId(String(id));
//   } catch {
//     return null;
//   }
// }

// /**
//  * POST /api/medicines/:id/block-pos
//  * Blocks a specific batch document from being shown/sold in POS.
//  * Does NOT change stock.
//  *
//  * Auth: uses req.user.pharmacyId
//  */
// export const blockMedicineFromPOS = async (req: Request, res: Response) => {
//   try {
//     const pharmacyIdRaw = (req.user as any)?.pharmacyId;
//     if (!pharmacyIdRaw) return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });

//     const pharmacyId = asObjectId(pharmacyIdRaw) ?? pharmacyIdRaw;

//     const med = await Medicine.findOne({ _id: req.params.id, pharmacyId });
//     if (!med) return res.status(404).json({ message: "Medicine batch not found" });

//     // Backward-compatible: if fields not present in DB yet, they can still be set
//     if ((med as any).isDisposed === true) {
//       return res.status(400).json({ message: "This batch is already disposed" });
//     }

//     (med as any).posStatus = "BLOCKED" as POSStatus;
//     await med.save();

//     return res.json({
//       message: "Batch blocked from POS",
//       data: {
//         _id: med._id,
//         medicineId: (med as any).medicineId,
//         name: (med as any).name,
//         batchNo: (med as any).batchNo,
//         posStatus: (med as any).posStatus,
//       },
//     });
//   } catch (err: any) {
//     console.error("blockMedicineFromPOS error:", err);
//     return res.status(500).json({
//       message: "Failed to block batch from POS",
//       error: err?.message || String(err),
//     });
//   }
// };

// /**
//  * POST /api/medicines/:id/unblock-pos
//  * Optional: unblocks a batch back to POS (if not disposed).
//  */
// export const unblockMedicineFromPOS = async (req: Request, res: Response) => {
//   try {
//     const pharmacyIdRaw = (req.user as any)?.pharmacyId;
//     if (!pharmacyIdRaw) return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });

//     const pharmacyId = asObjectId(pharmacyIdRaw) ?? pharmacyIdRaw;

//     const med = await Medicine.findOne({ _id: req.params.id, pharmacyId });
//     if (!med) return res.status(404).json({ message: "Medicine batch not found" });

//     if ((med as any).isDisposed === true) {
//       return res.status(400).json({ message: "This batch is disposed; cannot unblock" });
//     }

//     (med as any).posStatus = "ACTIVE" as POSStatus;
//     await med.save();

//     return res.json({
//       message: "Batch unblocked for POS",
//       data: {
//         _id: med._id,
//         medicineId: (med as any).medicineId,
//         name: (med as any).name,
//         batchNo: (med as any).batchNo,
//         posStatus: (med as any).posStatus,
//       },
//     });
//   } catch (err: any) {
//     console.error("unblockMedicineFromPOS error:", err);
//     return res.status(500).json({
//       message: "Failed to unblock batch for POS",
//       error: err?.message || String(err),
//     });
//   }
// };

// /**
//  * POST /api/medicines/:id/dispose
//  * After pharmacist physically removes stock, reflect it in app.
//  *
//  * body:
//  * - disposeAll?: boolean  (if true -> stock becomes 0)
//  * - qty?: number         (otherwise subtract qty)
//  * - note?: string
//  *
//  * Behavior:
//  * - subtracts stock safely (never below 0)
//  * - if stock becomes 0: marks isDisposed=true, sets disposedAt/disposedBy/note, and blocks from POS
//  *
//  * NOTE: This endpoint is intentionally NOT "expired-only" so you can also dispose damaged/returned stock.
//  * If you want expired-only, tell me and I’ll add the expiry check.
//  */
// export const disposeMedicineBatch = async (req: Request, res: Response) => {
//   try {
//     const pharmacyIdRaw = (req.user as any)?.pharmacyId;
//     const userIdRaw = (req.user as any)?._id;

//     if (!pharmacyIdRaw) return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });

//     const pharmacyId = asObjectId(pharmacyIdRaw) ?? pharmacyIdRaw;

//     const { disposeAll, qty, note } = (req.body ?? {}) as {
//       disposeAll?: boolean;
//       qty?: number;
//       note?: string;
//     };

//     const med = await Medicine.findOne({ _id: req.params.id, pharmacyId });
//     if (!med) return res.status(404).json({ message: "Medicine batch not found" });

//     const currentStock = Number((med as any).stock ?? 0);
//     if (currentStock <= 0) {
//       return res.status(400).json({ message: "Stock is already 0" });
//     }

//     const removeQty = disposeAll ? currentStock : Number(qty ?? 0);
//     if (!removeQty || removeQty <= 0) {
//       return res.status(400).json({ message: "qty must be > 0, or set disposeAll=true" });
//     }
//     if (removeQty > currentStock) {
//       return res.status(400).json({ message: "qty cannot exceed current stock" });
//     }

//     (med as any).stock = currentStock - removeQty;

//     // If fully removed => mark disposed + keep blocked from POS
//     if (Number((med as any).stock) === 0) {
//       (med as any).isDisposed = true;
//       (med as any).disposedAt = new Date();
//       (med as any).disposedBy = userIdRaw;
//       (med as any).disposeNote = note;
//       (med as any).posStatus = "BLOCKED" as POSStatus;
//     }

//     await med.save();

//     return res.json({
//       message: "Batch disposed successfully",
//       data: {
//         _id: med._id,
//         medicineId: (med as any).medicineId,
//         name: (med as any).name,
//         batchNo: (med as any).batchNo,
//         removedQty: removeQty,
//         newStock: (med as any).stock,
//         posStatus: (med as any).posStatus ?? "ACTIVE",
//         isDisposed: (med as any).isDisposed ?? false,
//         disposedAt: (med as any).disposedAt ?? null,
//         disposeNote: (med as any).disposeNote ?? null,
//       },
//     });
//   } catch (err: any) {
//     console.error("disposeMedicineBatch error:", err);
//     return res.status(500).json({
//       message: "Failed to dispose batch stock",
//       error: err?.message || String(err),
//     });
//   }
// };

import { Request, Response } from "express";
import mongoose from "mongoose";
import Batch from "../models/Batch";

/**
 * POST /api/medicines/:id/block-pos
 * Note: :id is now a BATCH id (not a product id).
 * Blocks a specific batch from POS without changing stock.
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