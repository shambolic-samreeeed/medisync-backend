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
  
  // ✅ CHANGED: Replaced unitPrice with costPrice and sellingPrice
  costPrice: string;
  sellingPrice: string;
  
  supplier?: string;
  expiryDate: string;
  manufactureDate?: string;
  addedAt?: string;
}

export interface MedicineInput {
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
  
  costPrice: number;
  sellingPrice: number;
  
  supplier?: string;
  expiryDate: Date;
  manufactureDate?: Date;
  addedAt?: Date;
}