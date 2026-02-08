/**
 * @file types/medicine.ts
 * @description
 * Type definitions for Medicine operations.
 */

export interface CSVMedicineRow {
  medicineId?: string;
  barcode?: string;
  name: string;
  brand?: string;
  category?: string;
  description?: string;
  batchNo: string;
  stock: string;
  reorderLevel?: string;
  unit?: string;
  unitPrice: string;
  supplier?: string;
  expiryDate: string;
  manufactureDate?: string;
  addedAt?: string;
}

export interface MedicineInput {
  // ✅ Added to make multi-pharmacy safe
  pharmacyId: string;
  uploadedBy?: string;

  medicineId?: string;
  barcode?: string;
  name: string;
  brand?: string;
  category?: string;
  description?: string;
  batchNo: string;
  stock: number;
  reorderLevel?: number;
  unit?: string;
  unitPrice: number;
  supplier?: string;
  expiryDate: Date;
  manufactureDate?: Date;
  addedAt?: Date;
}
