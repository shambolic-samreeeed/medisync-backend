import { Request, Response } from "express";
import csv from "csv-parser";
import Medicine from "../models/Medicine";
import { Readable } from "stream";

interface CSVMedicineRow {
  medicineId: string;
  name: string;
  batchNo: string;
  expiryDate: string;
  stock: string;
  unitPrice: string;
  supplier?: string;
}

export const uploadMedicineCSV = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const file = req.file;

  // ✅ FIX: Type narrowing
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
            {
              medicineId: med.medicineId,
              batchNo: med.batchNo,
            },
            {
              $set: {
                name: med.name,
                expiryDate: new Date(med.expiryDate),
                unitPrice: Number(med.unitPrice),
                supplier: med.supplier,
              },
              $inc: {
                stock: Number(med.stock), // ✅ ADD stock
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
