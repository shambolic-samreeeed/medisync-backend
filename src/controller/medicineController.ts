/**
 * @file controllers/medicineController.ts
 * @description
 * Medicine controllers for MediSync with Accounts Payable (Net 30) logic.
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

// ==========================================
// UPLOAD CSV + ACCOUNTS PAYABLE LOGIC
// ==========================================
export const uploadMedicineCSV = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const pharmacyId = req.user?.pharmacyId;
    const uploadedBy = req.user?._id;

    if (!pharmacyId) throw new Error("Unauthorized");

    const file = req.file;
    if (!file) throw new Error("CSV file is required");

    const { supplierId, invoiceNumber, purchaseDate } = req.body;

    if (!supplierId || !invoiceNumber) {
      throw new Error("supplierId and invoiceNumber required");
    }

    const supplier = await Supplier.findOne({
      _id: supplierId,
      pharmacyId,
    }).session(session);

    if (!supplier) throw new Error("Supplier not found");

    const purchaseDateObj = purchaseDate ? new Date(purchaseDate) : new Date();
    const dueDate = new Date(purchaseDateObj);
    dueDate.setDate(dueDate.getDate() + 30);

    const medicines: CSVMedicineRow[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from(file.buffer)
        .pipe(csv())
        .on("data", (row) => medicines.push(row))
        .on("end", resolve)
        .on("error", reject);
    });

    if (!medicines.length) throw new Error("CSV is empty");

    let total = 0;

    const purchaseItems = [];

    for (const med of medicines) {
      const stock = Number(med.stock || 0);
      const costPrice = Number(med.costPrice || 0);

      if (!med.medicineId || !med.name || !med.batchNo) {
        throw new Error("Missing required fields in CSV");
      }

      total += stock * costPrice;

      purchaseItems.push({
        medicineId: med.medicineId,
        name: med.name,
        batchNo: med.batchNo,
        quantity: stock,
        unitPrice: costPrice,
        expiryDate: new Date(med.expiryDate),
        supplier: supplier.name,
      });

      // 🧠 UPSERT MEDICINE + ADD BATCH
      await Medicine.findOneAndUpdate(
        {
          pharmacyId,
          medicineId: med.medicineId,
          batchNo: med.batchNo,
        },
        {
          $inc: { stock },
          $set: {
            name: med.name,
            brand: med.brand,
            category: med.category,
            costPrice,
            sellingPrice: Number(med.sellingPrice || 0),
            expiryDate: new Date(med.expiryDate),
            supplier: supplier.name,
          },
          $push: {
            batches: {
              batchNo: med.batchNo,
              stock,
              costPrice,
              sellingPrice: Number(med.sellingPrice || 0),
              expiryDate: new Date(med.expiryDate),
              createdAt: new Date(),
            },
          },
        },
        { upsert: true, session }
      );
    }

    const purchase = await Purchase.create(
      [
        {
          pharmacyId,
          supplierId,
          invoiceNumber,
          purchaseDate: purchaseDateObj,
          dueDate,
          totalAmount: total,
          paidAmount: 0,
          paymentStatus: "UNPAID",
          items: purchaseItems,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "CSV uploaded successfully ✅",
      purchaseId: purchase[0]._id,
      total,
    });

  } catch (err: any) {
    console.error(err);

    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    session.endSession();

    return res.status(500).json({
      message: err.message || "Upload failed",
    });
  }
};

// Manual Add
export const addMedicineManually = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    const uploadedBy = req.user?._id;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized" });

    const {
      medicineId, barcode, name, brand, category, description, batchNo,
      stock, reorderLevel, unit, costPrice, sellingPrice, supplier, 
      expiryDate, manufactureDate
    } = req.body;

    if (!name || !batchNo || !costPrice || !sellingPrice || !expiryDate) {
      return res.status(400).json({ message: "Missing required price/medicine fields" });
    }

    const medicine = await upsertMedicine({
      pharmacyId, uploadedBy, medicineId, barcode, name, brand, category, description,
      batchNo, stock: Number(stock), reorderLevel: Number(reorderLevel || 0),
      unit, costPrice: Number(costPrice), sellingPrice: Number(sellingPrice),
      supplier, expiryDate: new Date(expiryDate),
      manufactureDate: manufactureDate ? new Date(manufactureDate) : undefined,
    });

    return res.status(201).json({ message: "Medicine added", data: medicine });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed", error: error.message });
  }
};

// GET ALL
export const getAllMedicines = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    const medicines = await Medicine.find({ pharmacyId }).sort({ name: 1 });
    return res.status(200).json(medicines);
  } catch (error: any) {
    return res.status(500).json({ message: "Failed", error: error.message });
  }
};

// UPDATE PRICES
export const updateMedicinePrices = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    const { id } = req.params;
    const { costPrice, sellingPrice } = req.body;

    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized" });
    if (Number(sellingPrice) < Number(costPrice)) {
      return res.status(400).json({ message: "Selling price cannot be < Cost price" });
    }

    const updatedMedicine = await Medicine.findOneAndUpdate(
      { _id: id, pharmacyId },
      { costPrice: Number(costPrice), sellingPrice: Number(sellingPrice) },
      { new: true }
    );

    return res.status(200).json({ success: true, data: updatedMedicine });
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to update prices", error: error.message });
  }
};