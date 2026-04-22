/**
 * @file utils/medicineHelper.ts
 * @description
 * Pharmacy-safe upsert helper for medicines.
 */

import Medicine from "../models/Medicine";
import { MedicineInput } from "../types/medicine";

export const upsertMedicine = async (input: MedicineInput) => {
  const {
    pharmacyId,
    uploadedBy,
    medicineId,
    barcode,
    name,
    brand,
    category,
    description,
    batchNo,
    stock,
    reorderLevel = 0,
    unit,
    
    // ✅ CHANGED: Replaced unitPrice with the two new prices
    costPrice,
    sellingPrice,
    
    supplier,
    expiryDate,
    manufactureDate,
    addedAt,
  } = input;

  if (!pharmacyId) throw new Error("upsertMedicine: pharmacyId is required");
  if (!name) throw new Error("upsertMedicine: name is required");
  if (!batchNo) throw new Error("upsertMedicine: batchNo is required");
  if (!expiryDate) throw new Error("upsertMedicine: expiryDate is required");

  const existing = await Medicine.findOne({
    pharmacyId,
    name,
    batchNo,
  });

  if (existing) {
    existing.uploadedBy = uploadedBy as any;
    existing.medicineId = medicineId ?? existing.medicineId;
    existing.barcode = barcode ?? existing.barcode;
    existing.brand = brand ?? existing.brand;
    existing.category = category ?? existing.category;
    existing.description = description ?? existing.description;
    existing.stock = stock;
    existing.reorderLevel = reorderLevel;
    existing.unit = unit ?? existing.unit;
    
    // ✅ CHANGED: Update existing record with new prices
    existing.costPrice = costPrice;
    existing.sellingPrice = sellingPrice;
    
    existing.supplier = supplier ?? existing.supplier;
    existing.expiryDate = expiryDate;
    existing.manufactureDate = manufactureDate ?? existing.manufactureDate;
    // existing.addedAt = addedAt ?? existing.addedAt;

    await existing.save();
    return existing;
  }

  const created = await Medicine.create({
    pharmacyId,
    uploadedBy,
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
    
    // ✅ CHANGED: Create new record with new prices
    costPrice,
    sellingPrice,
    
    supplier,
    expiryDate,
    manufactureDate,
    addedAt: addedAt ?? new Date(),
  });

  return created;
};