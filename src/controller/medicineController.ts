/**
 * @file controllers/medicineController.ts
 * @description
 * Contains all Express controller functions related to medicine management.
 *
 * Functions:
 * 1. uploadMedicineCSV(req, res)
 *    - Handles CSV file upload.
 *    - Parses CSV rows and converts to MedicineInput format.
 *    - Uses `upsertMedicine` helper to update existing batches or create new ones.
 *
 * 2. addMedicineManually(req, res)
 *    - Handles manual addition of a single medicine batch via API request.
 *    - Validates required fields.
 *    - Uses `upsertMedicine` helper for consistent batch handling.
 *
 * 3. getAllMedicines(req, res)
 *    - Retrieves all medicines from the database.
 *    - Sorted by name and batch number.
 *
 * Purpose:
 * - Exposes REST API endpoints for pharmacy inventory management.
 * - Ensures consistent handling of stock updates and batch creation.
 */


import { Request, Response } from "express";
import csv from "csv-parser";
import { Readable } from "stream";
import Medicine from "../models/Medicine";
import { CSVMedicineRow, MedicineInput } from "../types/medicine";
import { upsertMedicine } from "../utils/medicineHelper";

// Upload CSV
// export const uploadMedicineCSV = async (req: Request, res: Response) => {
//   const file = req.file;

//   if (!file) {
//     return res.status(400).json({ message: "CSV file is required" });
//   }

//   const medicines: CSVMedicineRow[] = [];

//   Readable.from(file.buffer)
//     .pipe(csv())
//     .on("data", (row: CSVMedicineRow) => {
//       medicines.push(row);
//     })
//     .on("end", async () => {
//       try {
//         for (const med of medicines) {
//           await upsertMedicine({
//             medicineId: med.medicineId,
//             barcode: med.barcode,
//             name: med.name,
//             brand: med.brand,
//             category: med.category,
//             description: med.description,
//             batchNo: med.batchNo,
//             stock: Number(med.stock),
//             reorderLevel: med.reorderLevel ? Number(med.reorderLevel) : 0,
//             unit: med.unit,
//             unitPrice: Number(med.unitPrice),
//             supplier: med.supplier,
//             expiryDate: new Date(med.expiryDate),
//             manufactureDate: med.manufactureDate ? new Date(med.manufactureDate) : undefined,
//             addedAt: med.addedAt ? new Date(med.addedAt) : new Date(),
//           });
//         }

//         res.status(200).json({
//           message: "CSV uploaded and stock updated",
//           records: medicines.length,
//         });
//       } catch (error) {
//         res.status(500).json({
//           message: "CSV processing failed",
//           error,
//         });
//       }
//     });
// };

// Upload CSV (pharmacy-safe)
export const uploadMedicineCSV = async (req: Request, res: Response) => {
  try {
    //  Get pharmacyId from logged-in user (set by your auth middleware)
    const pharmacyId = (req as any).user?.pharmacyId?._id || (req as any).user?.pharmacyId;
    const uploadedBy = (req as any).user?._id;

    if (!pharmacyId) {
      return res.status(401).json({
        message: "Unauthorized: pharmacyId missing. Make sure auth middleware sets req.user.pharmacyId",
      });
    }

    // 2) Validate file
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "CSV file is required" });
    }

    const medicines: CSVMedicineRow[] = [];

    // 3) Parse CSV into array (Promise so we can await)
    await new Promise<void>((resolve, reject) => {
      Readable.from(file.buffer)
        .pipe(csv())
        .on("data", (row: CSVMedicineRow) => medicines.push(row))
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });

    //  4) Upsert each row WITH pharmacyId (this is the key change)
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
      pharmacyId,
      records: medicines.length,
    });
  } catch (error: any) {
    console.error("uploadMedicineCSV error:", error);
    return res.status(500).json({
      message: "CSV processing failed",
      error: error?.message || error,
    });
  }
};

// Manual Add
export const addMedicineManually = async (req: Request, res: Response) => {
  try {
    // ✅ 1) Get pharmacy from logged-in user
    const pharmacyId =
      (req as any).user?.pharmacyId?._id || (req as any).user?.pharmacyId;

    if (!pharmacyId) {
      return res.status(401).json({ message: "Not logged in" });
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

    const medicine = await upsertMedicine({
      pharmacyId, 
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

    res.status(201).json({
      message: "Medicine added / updated successfully",
      data: medicine,
    });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to add medicine", error: error.message });
  }
};

export const getAllMedicines = async (req: Request, res: Response) => {
  try {
    //  1) Get pharmacy from logged-in user
    const pharmacyId =
      (req as any).user?.pharmacyId?._id || (req as any).user?.pharmacyId;

    if (!pharmacyId) {
      return res.status(401).json({ message: "Not logged in" });
    }

    // 2) Only fetch this pharmacy’s medicines
    const medicines = await Medicine.find({ pharmacyId })
      .sort({ name: 1, batchNo: 1 });

    res.status(200).json(medicines);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch medicines", error });
  }
};

