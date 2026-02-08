/**
 * @file controller/saleController.ts
 * @description
 * Sale controller for MediSync (multi-pharmacy safe).
 *
 * Key rules:
 * - DO NOT accept pharmacyId from the client.
 * - Always take pharmacyId from `req.user.pharmacyId` (set by authMiddleware).
 * - Every medicine lookup/update must include pharmacyId so pharmacies can't affect each other.
 */

import { Request, Response } from "express";
import Sale from "../models/Sale";
import Medicine from "../models/Medicine";
import Stats from "../models/Stats";
import { SaleInput, CartItem } from "../types/sale";
import { v4 as uuidv4 } from "uuid";

// POST /api/sales
export const createSale = async (req: Request, res: Response) => {
  try {
    // ✅ Fix TS2322 + ensure pharmacy scoping
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const data: SaleInput = req.body;

    if (!data.items || data.items.length === 0) {
      return res.status(400).json({ message: "No items provided for sale." });
    }

    let totalAmount = 0;
    const saleItems: CartItem[] = [];

    // Check stock and calculate totals (pharmacy-safe)
    for (const item of data.items) {
      const medicine = await Medicine.findOne({
        pharmacyId, // ✅ IMPORTANT
        medicineId: item.medicineId,
        batchNo: item.batchNo,
      });

      if (!medicine) {
        return res.status(404).json({
          message: `Medicine ${item.medicineId} batch ${item.batchNo} not found for this pharmacy.`,
        });
      }

      if (medicine.stock < item.quantity) {
        return res.status(400).json({
          message: `Not enough stock for ${medicine.name} batch ${item.batchNo}.`,
        });
      }

      const total = medicine.unitPrice * item.quantity;
      totalAmount += total;

      saleItems.push({
        medicineId: item.medicineId,
        batchNo: medicine.batchNo,
        name: medicine.name,
        unitPrice: medicine.unitPrice,
        quantity: item.quantity,
        total,
      });
    }

    // Deduct stock (pharmacy-safe)
    for (const item of data.items) {
      await Medicine.findOneAndUpdate(
        {
          pharmacyId, // ✅ IMPORTANT
          medicineId: item.medicineId,
          batchNo: item.batchNo,
        },
        { $inc: { stock: -item.quantity } }
      );
    }

    const change = data.paidAmount - totalAmount;

    // Save sale record
    // NOTE: If your Sale schema doesn't have pharmacyId yet, add it later.
    // Keeping this line is still okay; Mongoose will store it if schema allows it,
    // or ignore it if strict mode blocks unknown fields.
    const saleRecord = new Sale({
      pharmacyId, // ✅ recommended for multi-pharmacy (add to Sale schema)
      saleId: uuidv4(),
      items: saleItems,
      totalAmount,
      paidAmount: data.paidAmount,
      change,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      paymentMethod: data.paymentMethod,
      invoiceNumber: `INV-${Date.now()}`,
    });

    await saleRecord.save();

    // -------------------------------
    // Update dashboard stats
    // -------------------------------
    // NOTE: Your Stats is currently global ("dashboardStats").
    // For multi-pharmacy, you should make stats per pharmacy (e.g. _id: `dashboardStats-${pharmacyId}`).
    const totalQuantity = saleItems.reduce((sum, item) => sum + item.quantity, 0);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    await Stats.findByIdAndUpdate(
      "dashboardStats",
      {
        $inc: {
          totalRevenue: totalAmount,
          totalSales: 1,
          totalItemsSold: totalQuantity,
        },
        $set: { lastUpdated: new Date() },
      },
      { upsert: true, new: true }
    );

    const dailyUpdateResult = await Stats.updateOne(
      { _id: "dashboardStats", "dailyStats.date": today },
      {
        $inc: {
          "dailyStats.$.revenue": totalAmount,
          "dailyStats.$.itemsSold": totalQuantity,
        },
      }
    );

    if (dailyUpdateResult.matchedCount === 0) {
      await Stats.updateOne(
        { _id: "dashboardStats" },
        { $push: { dailyStats: { date: today, revenue: totalAmount, itemsSold: totalQuantity } } },
        { upsert: true }
      );
    }

    for (const item of saleItems) {
      const updateResult = await Stats.updateOne(
        { _id: "dashboardStats", "bestSelling.medicineId": item.medicineId },
        { $inc: { "bestSelling.$.totalSold": item.quantity } }
      );

      if (updateResult.matchedCount === 0) {
        await Stats.updateOne(
          { _id: "dashboardStats" },
          { $push: { bestSelling: { medicineId: item.medicineId, name: item.name, totalSold: item.quantity } } }
        );
      }
    }

    return res.status(201).json({
      message: "Sale recorded successfully",
      sale: saleRecord,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ message: "Failed to process sale", error: error?.message || error });
  }
};
