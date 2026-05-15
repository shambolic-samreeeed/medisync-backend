/**
 * @file controllers/medicineController.ts
 * @description
 * Inventory controllers using the new GenericMedicine + ProductMedicine + Batch model.
 * Preserves CSV upload + Net-30 Accounts Payable logic.
 */

import { Request, Response } from "express";
import csv from "csv-parser";
import { Readable } from "stream";
import mongoose from "mongoose";

import GenericMedicine from "../models/GenericMedicine";
import ProductMedicine from "../models/ProductMedicine";
import Batch from "../models/Batch";
import Supplier from "../models/Supplier";
import Purchase from "../models/Purchase";

import { CSVMedicineRow } from "../types/medicine";
import {
  findOrCreateGeneric,
  findOrCreateProduct,
  getStockForProducts,
} from "../utils/inventoryHelpers";

// ==========================================
// HELPERS
// ==========================================
const toNum = (v: any, fallback = 0) => {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const parseDate = (v: any): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const requireFields = (row: CSVMedicineRow, rowIndex: number) => {
  const required = [
    "productCode",
    "brandName",
    "manufacturer",
    "genericName",
    "strength",
    "dosageForm",
    "batchNumber",
    "stock",
    "costPrice",
    "sellingPrice",
    "expiryDate",
  ];
  for (const f of required) {
    if (!row[f as keyof CSVMedicineRow] || String(row[f as keyof CSVMedicineRow]).trim() === "") {
      throw new Error(`Row ${rowIndex + 1}: missing required field "${f}"`);
    }
  }
};

// ==========================================
// CSV UPLOAD + NET-30 PURCHASE
// ==========================================
export const uploadMedicineCSV = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const pharmacyId = req.user?.pharmacyId;
    const userId = req.user?._id as mongoose.Types.ObjectId | string | undefined;

    if (!pharmacyId) throw new Error("Unauthorized");
    if (!userId) throw new Error("Unauthorized: missing user");

    const file = req.file;
    if (!file) throw new Error("CSV file is required");

    const { supplierId, invoiceNumber, purchaseDate } = req.body;
    if (!supplierId || !invoiceNumber) {
      throw new Error("supplierId and invoiceNumber are required");
    }

    const supplier = await Supplier.findOne({ _id: supplierId, pharmacyId }).session(session);
    if (!supplier) throw new Error("Supplier not found");

    // Net-30
    const purchaseDateObj = purchaseDate ? new Date(purchaseDate) : new Date();
    const dueDate = new Date(purchaseDateObj);
    dueDate.setDate(dueDate.getDate() + 30);

    // Parse CSV
    const rows: CSVMedicineRow[] = [];
    await new Promise<void>((resolve, reject) => {
      Readable.from(file.buffer)
        .pipe(csv())
        .on("data", (row) => rows.push(row))
        .on("end", () => resolve())
        .on("error", reject);
    });

    if (!rows.length) throw new Error("CSV is empty");

    let total = 0;
    const purchaseItems: any[] = [];

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      requireFields(row, i);

      const expiry = parseDate(row.expiryDate);
      if (!expiry) throw new Error(`Row ${i + 1}: invalid expiryDate "${row.expiryDate}"`);
      if (expiry <= new Date()) {
        throw new Error(`Row ${i + 1}: expiryDate is in the past`);
      }

      const stock = toNum(row.stock);
      const costPrice = toNum(row.costPrice);
      const sellingPrice = toNum(row.sellingPrice);

      if (stock <= 0) throw new Error(`Row ${i + 1}: stock must be > 0`);
      if (costPrice < 0) throw new Error(`Row ${i + 1}: costPrice cannot be negative`);
      if (sellingPrice < costPrice) {
        throw new Error(`Row ${i + 1}: sellingPrice cannot be less than costPrice`);
      }

      // 1) Find or create generic
      const generic = await findOrCreateGeneric({
        pharmacyId,
        userId,
        genericName: row.genericName.trim(),
        strength: row.strength.trim(),
        dosageForm: row.dosageForm.trim().toLowerCase(),
        category: row.category?.trim(),
        therapeuticClass: row.therapeuticClass?.trim(),
        session,
      });

      // 2) Find or create product (brand-level)
      const product = await findOrCreateProduct({
        pharmacyId,
        userId,
        genericId: generic._id,
        productCode: row.productCode.trim(),
        brandName: row.brandName.trim(),
        manufacturer: row.manufacturer.trim(),
        barcode: row.barcode?.trim() || undefined,
        packSize: toNum(row.packSize, 1),
        unit: row.unit?.trim() || "unit",
        defaultSellingPrice: sellingPrice,
        reorderLevel: toNum(row.reorderLevel, 0),
        session,
      });

      // 3) Create or top-up batch
      const existingBatch = await Batch.findOne({
        pharmacyId,
        productId: product._id,
        batchNumber: row.batchNumber.trim(),
      }).session(session);

      if (existingBatch) {
        existingBatch.initialQuantity += stock;
        existingBatch.currentQuantity += stock;
        if (existingBatch.status !== "ACTIVE") {
          existingBatch.costPrice = costPrice;
          existingBatch.sellingPrice = sellingPrice;
          existingBatch.expiryDate = expiry;
          existingBatch.status = "ACTIVE";
        }
        await existingBatch.save({ session });
      } else {
        await Batch.create(
          [
            {
              pharmacyId,
              productId: product._id,
              genericId: generic._id,
              batchNumber: row.batchNumber.trim(),
              expiryDate: expiry,
              manufactureDate: parseDate(row.manufactureDate),
              initialQuantity: stock,
              currentQuantity: stock,
              disposedQuantity: 0,
              costPrice,
              sellingPrice,
              supplierId: supplier._id,
              invoiceNumber,
              status: "ACTIVE",
              createdBy: userId,
            },
          ],
          { session }
        );
      }

      total += stock * costPrice;

      // Build purchase line item
      purchaseItems.push({
        medicineId: product.productCode,
        name: product.brandName,
        batchNo: row.batchNumber.trim(),
        quantity: stock,
        unitPrice: costPrice,
        expiryDate: expiry,
        supplier: supplier.name,
      });
    }

    // 4) Create Purchase invoice (Net-30)
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

    // 5) Backfill purchaseId on every batch we just created/touched for this invoice
    await Batch.updateMany(
      { pharmacyId, invoiceNumber, purchaseId: { $exists: false } },
      { $set: { purchaseId: purchase[0]._id } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "CSV uploaded successfully ✅",
      purchaseId: purchase[0]._id,
      total,
      rows: rows.length,
    });
  } catch (err: any) {
    console.error("CSV upload error:", err);
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ message: err.message || "Upload failed" });
  }
};

// ==========================================
// MANUAL ADD (single product + batch)
// ==========================================
export const addMedicineManually = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const pharmacyId = req.user?.pharmacyId;
    const userId = req.user?._id as mongoose.Types.ObjectId | string | undefined;

    if (!pharmacyId) throw new Error("Unauthorized");
    if (!userId) throw new Error("Unauthorized: missing user");

    const {
      // Generic info
      genericName, strength, dosageForm, category, therapeuticClass, description,
      // Product info
      productCode, brandName, manufacturer, barcode, packSize, unit, reorderLevel,
      // Batch info
      batchNumber, stock, costPrice, sellingPrice, expiryDate, manufactureDate,
      supplierId,
    } = req.body;

    // Validation
    if (!genericName || !strength || !dosageForm) {
      throw new Error("genericName, strength, and dosageForm are required");
    }
    if (!productCode || !brandName || !manufacturer) {
      throw new Error("productCode, brandName, and manufacturer are required");
    }
    if (!batchNumber || !stock || !costPrice || !sellingPrice || !expiryDate) {
      throw new Error("Batch info (batchNumber, stock, costPrice, sellingPrice, expiryDate) is required");
    }

    const expiry = parseDate(expiryDate);
    if (!expiry || expiry <= new Date()) {
      throw new Error("expiryDate must be a valid future date");
    }
    if (Number(sellingPrice) < Number(costPrice)) {
      throw new Error("Selling price cannot be less than cost price");
    }

    // 1) Generic
    const generic = await findOrCreateGeneric({
      pharmacyId, userId, genericName, strength, dosageForm,
      category, therapeuticClass, session,
    });

    // 2) Product
    const product = await findOrCreateProduct({
      pharmacyId, userId, genericId: generic._id,
      productCode, brandName, manufacturer, barcode,
      packSize: Number(packSize) || 1, unit: unit || "unit",
      defaultSellingPrice: Number(sellingPrice),
      reorderLevel: Number(reorderLevel) || 0,
      session,
    });

    // 3) Batch
    const existingBatch = await Batch.findOne({
      pharmacyId, productId: product._id, batchNumber,
    }).session(session);

    let batch;
    if (existingBatch) {
      existingBatch.initialQuantity += Number(stock);
      existingBatch.currentQuantity += Number(stock);
      if (existingBatch.status !== "ACTIVE") {
        existingBatch.status = "ACTIVE";
        existingBatch.costPrice = Number(costPrice);
        existingBatch.sellingPrice = Number(sellingPrice);
        existingBatch.expiryDate = expiry;
      }
      await existingBatch.save({ session });
      batch = existingBatch;
    } else {
      const created = await Batch.create(
        [
          {
            pharmacyId,
            productId: product._id,
            genericId: generic._id,
            batchNumber,
            expiryDate: expiry,
            manufactureDate: parseDate(manufactureDate),
            initialQuantity: Number(stock),
            currentQuantity: Number(stock),
            disposedQuantity: 0,
            costPrice: Number(costPrice),
            sellingPrice: Number(sellingPrice),
            supplierId,
            status: "ACTIVE",
            createdBy: userId,
          },
        ],
        { session }
      );
      batch = created[0];
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      message: "Medicine added",
      data: { generic, product, batch },
    });
  } catch (err: any) {
    console.error("Manual add error:", err);
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ message: err.message || "Failed" });
  }
};

// ==========================================
// GET ALL — products with computed stock
// ==========================================
export const getAllMedicines = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized" });

    const products = await ProductMedicine.find({ pharmacyId, isActive: true })
      .populate("genericId", "genericName strength dosageForm therapeuticClass category")
      .sort({ brandName: 1 })
      .lean<Array<{ _id: mongoose.Types.ObjectId; [key: string]: any }>>();

    const stockMap = await getStockForProducts(
      products.map((p) => p._id),
      pharmacyId
    );

    // Pull batch summary per product (next expiry, total batches)
    const productIds = products.map((p) => p._id);
    const batchAgg = await Batch.aggregate([
      {
        $match: {
          pharmacyId: new mongoose.Types.ObjectId(String(pharmacyId)),
          productId: { $in: productIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
        },
      },
      {
        $group: {
          _id: "$productId",
          totalBatches: { $sum: 1 },
          activeBatches: {
            $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] },
          },
          earliestExpiry: {
            $min: {
              $cond: [{ $eq: ["$status", "ACTIVE"] }, "$expiryDate", null],
            },
          },
        },
      },
    ]);
    const batchMap = new Map(batchAgg.map((b) => [String(b._id), b]));

    const enriched = products.map((p) => {
      const bs = batchMap.get(String(p._id));
      return {
        ...p,
        currentStock: stockMap.get(String(p._id)) ?? 0,
        totalBatches: bs?.totalBatches ?? 0,
        activeBatches: bs?.activeBatches ?? 0,
        earliestExpiry: bs?.earliestExpiry ?? null,
      };
    });

    return res.status(200).json(enriched);
  } catch (err: any) {
    console.error("getAllMedicines error:", err);
    return res.status(500).json({ message: "Failed", error: err.message });
  }
};

// ==========================================
// UPDATE PRICES — update default on Product + optionally a specific batch
// ==========================================
export const updateMedicinePrices = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    const { id } = req.params; // product id
    const { costPrice, sellingPrice, batchId } = req.body;

    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized" });
    if (Number(sellingPrice) < Number(costPrice)) {
      return res.status(400).json({ message: "Selling price cannot be < Cost price" });
    }

    // Always update the product's default selling price
    const updatedProduct = await ProductMedicine.findOneAndUpdate(
      { _id: id, pharmacyId },
      { $set: { defaultSellingPrice: Number(sellingPrice) } },
      { new: true }
    );
    if (!updatedProduct) return res.status(404).json({ message: "Product not found" });

    let updatedBatch = null;
    if (batchId) {
      // Update the specific batch's prices
      updatedBatch = await Batch.findOneAndUpdate(
        { _id: batchId, productId: id, pharmacyId },
        { $set: { costPrice: Number(costPrice), sellingPrice: Number(sellingPrice) } },
        { new: true }
      );
    }

    return res.status(200).json({
      success: true,
      data: { product: updatedProduct, batch: updatedBatch },
    });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to update prices", error: err.message });
  }
};