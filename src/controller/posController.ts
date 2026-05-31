import { Request, Response } from "express";
import mongoose from "mongoose";
import ProductMedicine from "../models/ProductMedicine";

/**
 * Safely converts any pharmacyId representation to an ObjectId.
 */
function toObjectId(id: any): mongoose.Types.ObjectId {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (typeof id === "string" && mongoose.isValidObjectId(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  // Handle objects that have an _id (populated docs) or toString
  const asString = id?._id?.toString?.() ?? id?.toString?.();
  if (asString && mongoose.isValidObjectId(asString)) {
    return new mongoose.Types.ObjectId(asString);
  }
  throw new Error(`Invalid pharmacyId: ${JSON.stringify(id)}`);
}

/**
 * GET /api/pos/medicines
 * Returns active products that have at least one ACTIVE batch with stock.
 */
export const getSellableMedicinesForPOS = async (req: Request, res: Response) => {
  try {
    const rawPharmacyId = req.user?.pharmacyId;
    if (!rawPharmacyId) return res.status(401).json({ message: "Unauthorized" });

    const pharmacyObjId = toObjectId(rawPharmacyId);

    const data = await ProductMedicine.aggregate([
      { $match: { pharmacyId: pharmacyObjId, isActive: true, posStatus: "ACTIVE" } },
      {
        $lookup: {
          from: "genericmedicines",
          localField: "genericId",
          foreignField: "_id",
          as: "generic",
        },
      },
      { $unwind: { path: "$generic", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "batches",
          let: { pid: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$productId", "$$pid"] },
                status: "ACTIVE",
                currentQuantity: { $gt: 0 },
                expiryDate: { $gt: new Date() },
              },
            },
            { $sort: { expiryDate: 1, createdAt: 1 } },
            // Lookup supplier name from within the batch pipeline
            {
              $lookup: {
                from: "suppliers",
                localField: "supplierId",
                foreignField: "_id",
                as: "supplierDoc",
              },
            },
            {
              $addFields: {
                supplierName: { $arrayElemAt: ["$supplierDoc.name", 0] },
              },
            },
          ],
          as: "activeBatches",
        },
      },
      {
        $addFields: {
          totalStock: { $sum: "$activeBatches.currentQuantity" },
          nextBatch: { $arrayElemAt: ["$activeBatches", 0] },
        },
      },
      { $match: { totalStock: { $gt: 0 } } },
      {
        $project: {
          _id: 1,
          productCode: 1,
          brandName: 1,
          manufacturer: 1,
          barcode: 1,
          unit: 1,
          packSize: 1,
          defaultSellingPrice: 1,
          reorderLevel: 1,
          photoUrl: 1,
          totalStock: 1,
          createdAt: 1,       
          generic: {
            _id: "$generic._id",
            genericName: "$generic.genericName",
            strength: "$generic.strength",
            dosageForm: "$generic.dosageForm",
            therapeuticClass: "$generic.therapeuticClass",
          },
          nextBatch: {
            _id: "$nextBatch._id",
            batchNumber: "$nextBatch.batchNumber",
            sellingPrice: "$nextBatch.sellingPrice",
            expiryDate: "$nextBatch.expiryDate",
            currentQuantity: "$nextBatch.currentQuantity",
            manufactureDate: "$nextBatch.manufactureDate", 
            supplierName: "$nextBatch.supplierName",       
          },
        },
      },
      { $sort: { brandName: 1 } },
    ]);

    return res.status(200).json(data);
  } catch (err: any) {
    console.error("getSellableMedicinesForPOS:", err);
    return res
      .status(500)
      .json({ message: "Failed to load POS medicines", error: err.message });
  }
};