/**
 * @file controller/saleController.ts
 * @description
 * Sale controller for MediSync POS (multi-pharmacy safe)
 *
 * Key Principles:
 * 1. Do NOT accept `pharmacyId` from the client.
 * 2. Always read pharmacyId from `req.user.pharmacyId` (set by authMiddleware).
 * 3. All medicine lookups, stock updates, and sales creation are scoped to the logged-in pharmacy.
 * 4. Dashboard stats (total revenue, daily stats, best-selling) are also per pharmacy.
 * 5. Optionally link a sale to a registered customer by phone.
 */

import { Request, Response } from "express";
import Sale from "../models/Sale";
import Medicine from "../models/Medicine";
import Stats from "../models/Stats";
import Customer from "../models/Customer"; // optional if you track customers
import { SaleInput, CartItem } from "../types/sale";
import { v4 as uuidv4 } from "uuid";

/**
 * @route POST /api/sales
 * @desc Record a new sale (POS transaction)
 * @access Protected (requires valid JWT with pharmacyId)
 *
 * @body { 
 *   items: Array<{ medicineId: string, batchNo: string, quantity: number }>,
 *   customerName?: string,
 *   customerPhone?: string,
 *   customerEmail?: string,
 *   paymentMethod: string ("cash", "card", etc),
 *   paidAmount: number
 * }
 *
 * @returns { sale: Sale, message: string }
 */
export const createSale = async (req: Request, res: Response) => {
  try {
    // -------------------------------
    // 1️⃣ Get pharmacyId from logged-in user
    // -------------------------------
    const pharmacyId = (req.user as any)?.pharmacyId;
    if (!pharmacyId) {
      return res.status(401).json({ message: "Unauthorized: pharmacyId missing" });
    }

    const data: SaleInput = req.body;

    if (!data.items || data.items.length === 0) {
      return res.status(400).json({ message: "No items provided for sale." });
    }

    let totalAmount = 0;
    const saleItems: CartItem[] = [];

    // -------------------------------
    // 2️⃣ Check stock and calculate totals
    // -------------------------------
    for (const item of data.items) {
      const medicine = await Medicine.findOne({
        pharmacyId,           // ✅ Scope by logged-in pharmacy
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

    // -------------------------------
    // 3️⃣ Deduct stock (pharmacy-scoped)
    // -------------------------------
    for (const item of data.items) {
      await Medicine.findOneAndUpdate(
        {
          pharmacyId,
          medicineId: item.medicineId,
          batchNo: item.batchNo,
        },
        { $inc: { stock: -item.quantity } }
      );
    }

    // -------------------------------
    // 4️⃣ Calculate change
    // -------------------------------
    const change = data.paidAmount - totalAmount;

    // -------------------------------
    // 5️⃣ Find customer by phone (optional)
    // -------------------------------
    let customerId: string | undefined;
    if (data.customerPhone) {
      const customer = await Customer.findOne({ phone: data.customerPhone });
      if (customer) customerId = customer._id.toString();
    }

    // -------------------------------
    // 6️⃣ Save sale record with pharmacyId & optional customerId
    // -------------------------------
    const saleRecord = new Sale({
      pharmacyId,           // ✅ Links sale to logged-in pharmacy
      saleId: uuidv4(),
      items: saleItems,
      totalAmount,
      paidAmount: data.paidAmount,
      change,
      customerId,           // optional
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      paymentMethod: data.paymentMethod,
      invoiceNumber: `INV-${Date.now()}`,
    });

    await saleRecord.save();

    // -------------------------------
    // 7️⃣ Update dashboard stats (per pharmacy)
    // -------------------------------
    const statsId = `dashboardStats-${pharmacyId}`; // unique per pharmacy
    const totalQuantity = saleItems.reduce((sum, item) => sum + item.quantity, 0);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Overall stats
    await Stats.findByIdAndUpdate(
      statsId,
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

    // Daily stats
    const dailyUpdateResult = await Stats.updateOne(
      { _id: statsId, "dailyStats.date": today },
      {
        $inc: {
          "dailyStats.$.revenue": totalAmount,
          "dailyStats.$.itemsSold": totalQuantity,
        },
      }
    );

    if (dailyUpdateResult.matchedCount === 0) {
      await Stats.updateOne(
        { _id: statsId },
        { $push: { dailyStats: { date: today, revenue: totalAmount, itemsSold: totalQuantity } } },
        { upsert: true }
      );
    }

    // Best-selling medicines
    for (const item of saleItems) {
      const updateResult = await Stats.updateOne(
        { _id: statsId, "bestSelling.medicineId": item.medicineId },
        { $inc: { "bestSelling.$.totalSold": item.quantity } }
      );

      if (updateResult.matchedCount === 0) {
        await Stats.updateOne(
          { _id: statsId },
          { $push: { bestSelling: { medicineId: item.medicineId, name: item.name, totalSold: item.quantity } } }
        );
      }
    }

    // -------------------------------
    // 8️⃣ Return the sale record
    // -------------------------------
    return res.status(201).json({
      message: "Sale recorded successfully",
      sale: saleRecord,
    });

  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      message: "Failed to process sale",
      error: error?.message || error,
    });
  }
};
