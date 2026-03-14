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
  let session: mongoose.ClientSession | null = null;
  
  try {
    session = await mongoose.startSession();
    
    const pharmacyId = req.user?.pharmacyId;
    const uploadedBy = req.user?._id;

    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized." });

    const file = req.file;
    if (!file) return res.status(400).json({ message: "CSV file is required" });

    const supplierId = (req.body?.supplierId || "").toString().trim();
    const invoiceNumber = (req.body?.invoiceNumber || "").toString().trim();
    const purchaseDateRaw = req.body?.purchaseDate;

    if (!supplierId || !invoiceNumber) {
      return res.status(400).json({ message: "supplierId and invoiceNumber are required" });
    }

    const supplier = await Supplier.findOne({ _id: supplierId, pharmacyId });
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    // 🚀 FIXED DATE LOGIC
    // 1. Get the purchase date (from body or fallback to "now")
    const purchaseDate = purchaseDateRaw ? new Date(purchaseDateRaw) : new Date();
    
    // 2. Clone it for the Due Date calculation to avoid mutating the original
    const dueDate = new Date(purchaseDate.getTime()); 
    dueDate.setDate(dueDate.getDate() + 30);

    let totalInvoiceAmount = 0;
    const medicines: CSVMedicineRow[] = [];

    await new Promise<void>((resolve, reject) => {
      Readable.from(file.buffer)
        .pipe(csv())
        .on("data", (row: CSVMedicineRow) => medicines.push(row))
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });

    if (medicines.length === 0) return res.status(400).json({ message: "CSV is empty" });

    const purchaseItems = medicines.map((med, idx) => {
      const stock = toNum(med.stock) || 0;
      const costPrice = toNum(med.costPrice) || 0;
      const sellingPrice = toNum(med.sellingPrice) || 0;

      if (!med.medicineId || !med.name || !med.batchNo) {
        throw new Error(`Row ${idx + 1}: Missing medicineId, name, or batchNo`);
      }

      totalInvoiceAmount += (costPrice * stock);

      return {
        medicineId: med.medicineId,
        name: med.name,
        batchNo: med.batchNo,
        quantity: stock,
        unitPrice: costPrice,
        expiryDate: new Date(med.expiryDate),
        supplier: med.supplier || supplier.name, 
      };
    });

    session.startTransaction();

    const createdPurchase = await Purchase.create(
      [{
        pharmacyId,
        supplierId: supplier._id,
        invoiceNumber,
        purchaseDate,      // The original date (e.g., Feb 12)
        dueDate,           // Exactly 30 days later (e.g., March 14)
        totalAmount: totalInvoiceAmount,
        paidAmount: 0,
        paymentStatus: "UNPAID",
        items: purchaseItems,
      }],
      { session }
    );

    for (const med of medicines) {
      await upsertMedicine({
        pharmacyId,
        uploadedBy,
        medicineId: med.medicineId!,
        barcode: med.barcode,
        name: med.name,
        brand: med.brand,
        category: med.category,
        description: med.description,
        batchNo: med.batchNo,
        stock: Number(med.stock),
        reorderLevel: med.reorderLevel ? Number(med.reorderLevel) : 0,
        unit: med.unit,
        costPrice: Number(med.costPrice),
        sellingPrice: Number(med.sellingPrice),
        supplier: med.supplier || supplier.name,
        expiryDate: new Date(med.expiryDate),
        manufactureDate: med.manufactureDate ? new Date(med.manufactureDate) : undefined,
      });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "CSV processed successfully ✅",
      invoiceTotal: totalInvoiceAmount,
      purchaseDate: purchaseDate.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      purchaseId: createdPurchase[0]._id,
    });

  } catch (error: any) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    return res.status(500).json({ message: "CSV failed", error: error.message });
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