/**
 * @file controllers/medicineController.ts
 * @description
 * Medicine controllers for MediSync (pharmacy-safe).
 *
 * Key rule:
 * - Never accept pharmacyId from client.
 * - Always use req.user.pharmacyId (set by authMiddleware).
 */

import { Request, Response } from "express";
import csv from "csv-parser";
import { Readable } from "stream";
import mongoose from "mongoose";

import Medicine from "../models/Medicine";
import Supplier from "../models/Supplier";
import Purchase from "../models/Purchase";

import { CSVMedicineRow } from "../types/medicine";
import { upsertMedicine } from "../utils/medicineHelper";

const parseDate = (v: any) => {
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const toNum = (v: any) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Upload CSV + Record Purchase (Supplier + Invoice) + Update Stock
 *
 * multipart/form-data:
 * - file (CSV) (key: "file")
 * - supplierId (required)
 * - invoiceNumber (required)
 * - purchaseDate (optional)
 */
export const uploadMedicineCSV = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    const pharmacyId = req.user?.pharmacyId;
    const uploadedBy = req.user?._id;

    if (!pharmacyId) {
      return res.status(401).json({
        message:
          "Unauthorized: pharmacyId missing. Make sure auth middleware sets req.user.pharmacyId",
      });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "CSV file is required" });
    }

    // ✅ Supplier tracking fields
    const supplierId = (req.body?.supplierId || "").toString().trim();
    const invoiceNumber = (req.body?.invoiceNumber || "").toString().trim();
    const purchaseDateRaw = req.body?.purchaseDate;

    if (!supplierId) {
      return res.status(400).json({ message: "supplierId is required" });
    }
    if (!invoiceNumber) {
      return res.status(400).json({ message: "invoiceNumber is required" });
    }

    const supplier = await Supplier.findOne({ _id: supplierId, pharmacyId });
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found for this pharmacy" });
    }

    const purchaseDate = purchaseDateRaw ? parseDate(purchaseDateRaw) : new Date();
    if (purchaseDateRaw && !purchaseDate) {
      return res.status(400).json({ message: "purchaseDate is invalid" });
    }

    // Parse CSV
    const medicines: CSVMedicineRow[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from(file.buffer)
        .pipe(csv())
        .on("data", (row: CSVMedicineRow) => medicines.push(row))
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });

    if (medicines.length === 0) {
      return res.status(400).json({ message: "CSV is empty" });
    }

    // Build purchase items from CSV (validation)
    const purchaseItems = medicines.map((med, idx) => {
      const stock = toNum(med.stock);
      const unitPrice = toNum(med.unitPrice);
      const expiryDate = parseDate(med.expiryDate);

      if (!med.medicineId || !med.name || !med.batchNo) {
        throw new Error(`Row ${idx + 1}: medicineId, name, batchNo are required`);
      }
      if (!stock || stock <= 0) {
        throw new Error(`Row ${idx + 1}: stock must be a number > 0`);
      }
      if (!unitPrice || unitPrice <= 0) {
        throw new Error(`Row ${idx + 1}: unitPrice must be a number > 0`);
      }
      if (!expiryDate) {
        throw new Error(`Row ${idx + 1}: expiryDate is invalid`);
      }

      return {
        medicineId: med.medicineId,
        name: med.name,
        batchNo: med.batchNo,
        quantity: stock,
        unitPrice: unitPrice,
        expiryDate: expiryDate,
        supplier: med.supplier || supplier.name, // optional
      };
    });

    // Transaction: purchase history + stock update must both succeed
    session.startTransaction();

    // 1) Save purchase record
    const createdPurchase = await Purchase.create(
      [
        {
          pharmacyId,
          supplierId: supplier._id,
          invoiceNumber,
          purchaseDate,
          items: purchaseItems,
        },
      ],
      { session }
    );

    // 2) Update stock using your existing helper
    // NOTE: upsertMedicine probably doesn't use session internally, so purchase+stock won't be perfectly atomic.
    // If you want full atomicity, share medicineHelper.ts and I'll update it to accept session.
    for (const med of medicines) {
      await upsertMedicine({
        pharmacyId,
        uploadedBy,

        medicineId: med.medicineId,
        barcode: med.barcode,
        name: med.name,
        brand: med.brand,
        category: med.category,
        description: med.description,
        batchNo: med.batchNo,

        stock: Number(med.stock),
        reorderLevel: med.reorderLevel ? Number(med.reorderLevel) : 0,
        unit: med.unit,
        unitPrice: Number(med.unitPrice),

        // keep supplier string consistent
        supplier: med.supplier || supplier.name,

        expiryDate: new Date(med.expiryDate),
        manufactureDate: med.manufactureDate ? new Date(med.manufactureDate) : undefined,
        addedAt: med.addedAt ? new Date(med.addedAt) : new Date(),
      });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "CSV uploaded, purchase recorded, and stock updated ✅",
      records: medicines.length,
      purchaseId: createdPurchase[0]._id,
    });
  } catch (error: any) {
    try {
      await session.abortTransaction();
    } catch {}
    session.endSession();

    if (error?.code === 11000) {
      return res.status(409).json({
        message: "Duplicate invoice detected for this supplier (invoiceNumber already exists).",
      });
    }

    return res.status(500).json({
      message: "CSV processing failed",
      error: error?.message || String(error),
    });
  }
};

// Manual Add (unchanged)
export const addMedicineManually = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    const uploadedBy = req.user?._id;

    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const {
      medicineId,
      barcode,
      name,
      brand,
      category,
      description,
      batchNo,
      stock,
      reorderLevel,
      unit,
      unitPrice,
      supplier,
      expiryDate,
      manufactureDate,
      addedAt,
    } = req.body;

    if (!name || !batchNo || stock === undefined || !unitPrice || !expiryDate) {
      return res.status(400).json({
        message: "Missing required fields: name, batchNo, stock, unitPrice, or expiryDate",
      });
    }

    const medicine = await upsertMedicine({
      pharmacyId,
      uploadedBy,

      medicineId,
      barcode,
      name,
      brand,
      category,
      description,
      batchNo,
      stock: Number(stock),
      reorderLevel: reorderLevel ? Number(reorderLevel) : 0,
      unit,
      unitPrice: Number(unitPrice),
      supplier,
      expiryDate: new Date(expiryDate),
      manufactureDate: manufactureDate ? new Date(manufactureDate) : undefined,
      addedAt: addedAt ? new Date(addedAt) : new Date(),
    });

    return res.status(201).json({
      message: "Medicine added/updated successfully",
      data: medicine,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Duplicate medicine batch detected (per pharmacy)" });
    }
    return res.status(500).json({ message: "Failed to add medicine", error: error.message });
  }
};

// Get medicines for logged-in pharmacy only (unchanged)
export const getAllMedicines = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;

    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const medicines = await Medicine.find({ pharmacyId }).sort({ name: 1, batchNo: 1 });
    return res.status(200).json(medicines);
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to fetch medicine", error: error.message });
  }
};
