/**
 * @file utils/medicineHelper.ts
 * @description
 * Pharmacy-safe upsert helper for medicines.
 *
 * This function ensures:
 * - Each medicine record is tied to ONE pharmacy (pharmacyId is mandatory)
 * - Existing stock updates happen only within the same pharmacy
 * - Different pharmacies can have the same medicineId/batchNo without overwriting each other
 *
 * IMPORTANT:
 * - pharmacyId must be included in BOTH the lookup and the create.
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

  if (!pharmacyId) {
    throw new Error("upsertMedicine: pharmacyId is required");
  }
  if (!name) {
    throw new Error("upsertMedicine: name is required");
  }
  if (!batchNo) {
    throw new Error("upsertMedicine: batchNo is required");
  }
  if (!expiryDate) {
    throw new Error("upsertMedicine: expiryDate is required");
  }

  // ✅ Lookup must include pharmacyId
  const existing = await Medicine.findOne({
    pharmacyId,
    name,
    batchNo,
  });

  if (existing) {
    // ✅ Update existing record (still belongs to the same pharmacy)
    existing.uploadedBy = uploadedBy as any;

    existing.medicineId = medicineId ?? existing.medicineId;
    existing.barcode = barcode ?? existing.barcode;
    existing.brand = brand ?? existing.brand;
    existing.category = category ?? existing.category;
    existing.description = description ?? existing.description;

    existing.stock = stock;
    existing.reorderLevel = reorderLevel;
    existing.unit = unit ?? existing.unit;
    existing.unitPrice = unitPrice;
    existing.supplier = supplier ?? existing.supplier;

    existing.expiryDate = expiryDate;
    existing.manufactureDate = manufactureDate ?? existing.manufactureDate;
    existing.addedAt = addedAt ?? existing.addedAt;

    await existing.save();
    return existing;
  }

  // ✅ Create MUST include pharmacyId (schema requires it)
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
