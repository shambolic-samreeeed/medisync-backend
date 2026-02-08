/**
 * @file utils/medicineHelper.ts
 * @description
 * upsertMedicine helper:
 * - Updates stock if same medicine batch already exists for the same pharmacy
 * - Otherwise creates a new document
 *
 * IMPORTANT:
 * - Must include pharmacyId in the lookup to prevent pharmacies overwriting each other.
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
    unitPrice,
    supplier,
    expiryDate,
    manufactureDate,
    addedAt,
  } = input;

  // ✅ Find existing batch inside SAME pharmacy
  const existing = await Medicine.findOne({
    pharmacyId,
    name,
    batchNo,
  });

  if (existing) {
    // Update existing batch
    existing.medicineId = medicineId ?? existing.medicineId;
    existing.barcode = barcode ?? existing.barcode;
    existing.brand = brand ?? existing.brand;
    existing.category = category ?? existing.category;
    existing.description = description ?? existing.description;

    existing.stock = stock; // choose whether to replace or add; replace is simplest
    existing.reorderLevel = reorderLevel;
    existing.unit = unit ?? existing.unit;
    existing.unitPrice = unitPrice;
    existing.supplier = supplier ?? existing.supplier;
    existing.expiryDate = expiryDate;
    existing.manufactureDate = manufactureDate ?? existing.manufactureDate;
    existing.addedAt = addedAt ?? existing.addedAt;

    if (uploadedBy) existing.uploadedBy = uploadedBy as any;

    await existing.save();
    return existing;
  }

  // Create new document
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
    unitPrice,
    supplier,
    expiryDate,
    manufactureDate,
    addedAt: addedAt ?? new Date(),
  });

  return created;
};
