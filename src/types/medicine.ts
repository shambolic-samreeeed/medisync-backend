/**
 * @file types/medicine.ts
 * @description
 * Contains TypeScript interfaces for medicine-related data.
 *
 * Interfaces:
 * - MedicineInput: Defines the structure for creating/updating a medicine in the database.
 * - CSVMedicineRow: Defines the structure of a medicine row from a CSV file upload.
 *
 * Purpose:
 * - Ensures type safety throughout the application.
 * - Can be imported wherever medicine data is handled (controllers, helpers, services).
 */


export interface MedicineInput {
  pharmacyId?:string,
  uploadedBy?:string,
  
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
