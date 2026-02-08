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
import Medicine from "../models/Medicine";
import { CSVMedicineRow } from "../types/medicine";
import { upsertMedicine } from "../utils/medicineHelper";

// Upload CSV
export const uploadMedicineCSV = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    const uploadedBy = req.user?._id;

    if (!pharmacyId) {
      return res.status(401).json({
        message: "Unauthorized: pharmacyId missing. Make sure auth middleware sets req.user.pharmacyId",
      });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "CSV file is required" });
    }

    const medicines: CSVMedicineRow[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from(file.buffer)
        .pipe(csv())
        .on("data", (row: CSVMedicineRow) => medicines.push(row))
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });

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
        supplier: med.supplier,

        expiryDate: new Date(med.expiryDate),
        manufactureDate: med.manufactureDate ? new Date(med.manufactureDate) : undefined,
        addedAt: med.addedAt ? new Date(med.addedAt) : new Date(),
      });
    }

    return res.status(200).json({
      message: "CSV uploaded and stock updated",
      records: medicines.length,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "CSV processing failed",
      error: error?.message || error,
    });
  }
};

// Manual Add
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

// Get medicines for logged-in pharmacy only
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
