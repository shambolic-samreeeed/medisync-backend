/**
 * @file utils/medicineHelper.ts
 * @description
 * Provides helper functions for medicine database operations.
 *
 * Functions:
 * - upsertMedicine(data: MedicineInput): Finds a medicine by medicineId and batchNo.
 *     - If found, increments the stock and updates other fields.
 *     - If not found, creates a new medicine batch.
 *
 * Purpose:
 * - Centralizes medicine insert/update logic.
 * - Ensures consistent handling of stock updates across CSV uploads and manual additions.
 * - Reduces duplicate code and improves maintainability.
 */


import Medicine from "../models/Medicine";
import { MedicineInput } from "../types/medicine";

export const upsertMedicine = async (data: MedicineInput) => {
  const medicine = await Medicine.findOneAndUpdate(
    { medicineId: data.medicineId || undefined, batchNo: data.batchNo },
    {
      $set: {
        name: data.name,
        barcode: data.barcode,
        brand: data.brand,
        category: data.category,
        description: data.description,
        expiryDate: data.expiryDate,
        manufactureDate: data.manufactureDate,
        unitPrice: data.unitPrice,
        supplier: data.supplier,
        reorderLevel: data.reorderLevel || 0,
        unit: data.unit,
        addedAt: data.addedAt || new Date(),
      },
      $inc: {
        stock: data.stock,
      },
    },
    { upsert: true, new: true }
  );

  return medicine;
};
