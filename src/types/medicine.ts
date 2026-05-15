// /**
//  * @file types/medicine.ts
//  * @description
//  * Type definitions for Medicine operations.
//  */

// export interface CSVMedicineRow {
//   medicineId?: string;
//   barcode?: string;
//   name: string;
//   brand?: string;
//   category?: string;
//   description?: string;
//   batchNo: string;
//   stock: string;
//   reorderLevel?: string;
//   unit?: string;
  
//   // ✅ CHANGED: Replaced unitPrice with costPrice and sellingPrice
//   costPrice: string;
//   sellingPrice: string;
  
//   supplier?: string;
//   expiryDate: string;
//   manufactureDate?: string;
//   addedAt?: string;
// }

// export interface MedicineInput {
//   pharmacyId: string;
//   uploadedBy?: string;

//   medicineId?: string;
//   barcode?: string;
//   name: string;
//   brand?: string;
//   category?: string;
//   description?: string;
//   batchNo: string;
//   stock: number;
//   reorderLevel?: number;
//   unit?: string;
  
//   costPrice: number;
//   sellingPrice: number;
  
//   supplier?: string;
//   expiryDate: Date;
//   manufactureDate?: Date;
//   addedAt?: Date;
// }

export interface CSVMedicineRow {
  // Identity (required)
  productCode: string;       // your internal SKU
  brandName: string;         // "Cetamol"
  manufacturer: string;      // "Acme Pharma"

  // Generic info (required)
  genericName: string;       // "Paracetamol"
  strength: string;          // "500mg"
  dosageForm: string;        // "tablet" | "syrup" | ...

  // Optional product fields
  barcode?: string;
  category?: string;
  therapeuticClass?: string;
  packSize?: string;
  unit?: string;
  reorderLevel?: string;

  // Batch info (required)
  batchNumber: string;
  stock: string;             // initial quantity
  costPrice: string;
  sellingPrice: string;
  expiryDate: string;        // YYYY-MM-DD
  manufactureDate?: string;
}

// Older type kept as alias so existing code won't error during the refactor.
// Delete this once you're sure nothing imports it anymore.
export type LegacyCSVMedicineRow = CSVMedicineRow;