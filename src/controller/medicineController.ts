import { Request, Response } from "express";
import csv from "csv-parser";
import Medicine from "../models/Medicine";
import { Readable } from "stream";

interface CSVMedicineRow {
  medicineId?: string;        // optional, auto-generate if missing
  barcode?: string;
  name: string;
  brand?: string;
  category?: string;
  description?: string;
  batchNo: string;
  stock: string;              // CSVs are always strings
  reorderLevel?: string;
  unit?: string;
  unitPrice: string;
  supplier?: string;
  expiryDate: string;
  manufactureDate?: string;
  addedAt?: string;
}


export const uploadMedicineCSV = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "CSV file is required" });
  }

  const medicines: CSVMedicineRow[] = [];

  Readable.from(file.buffer)
    .pipe(csv())
    .on("data", (row: CSVMedicineRow) => {
      medicines.push(row);
    })
    .on("end", async () => {
      try {
        for (const med of medicines) {
          await Medicine.findOneAndUpdate(
  { medicineId: med.medicineId || undefined, batchNo: med.batchNo },
  {
    $set: {
      name: med.name,
      barcode: med.barcode,
      brand: med.brand,
      category: med.category,
      description: med.description,
      expiryDate: new Date(med.expiryDate),
      manufactureDate: med.manufactureDate ? new Date(med.manufactureDate) : undefined,
      unitPrice: Number(med.unitPrice),
      supplier: med.supplier,
      reorderLevel: med.reorderLevel ? Number(med.reorderLevel) : 0,
      unit: med.unit,
      addedAt: med.addedAt ? new Date(med.addedAt) : new Date(),
    },
    $inc: {
      stock: Number(med.stock),
    },
  },
  { upsert: true }
);

        }

        res.status(200).json({
          message: "CSV uploaded and stock updated",
          records: medicines.length,
        });
      } catch (error) {
        res.status(500).json({
          message: "CSV processing failed",
          error,
        });
      }
    });

  return res;
};

export const getAllMedicines = async (req: Request, res: Response)=>{
    try{
        const medicines = await Medicine.find().sort({ name: 1, batchNo: 1});
        res.status(200).json(medicines);
    }catch(error){
        console.error(error);
        res.status(500).json({message: 'Failed to fetch medicine', error});
    }
}