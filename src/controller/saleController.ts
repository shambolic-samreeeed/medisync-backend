/**
 * @file controller/saleController.ts
 * @description
 * Sale controller for MediSync POS (multi-pharmacy safe)
 *
 * Key Principles:
 * 1) Do NOT accept pharmacyId from the client.
 * 2) Always read pharmacyId from req.user.pharmacyId (set by authMiddleware).
 * 3) All medicine lookups, stock updates, and sales creation are scoped to the logged-in pharmacy.
 * 4) Dashboard stats (total revenue, daily stats, best-selling) are also per pharmacy.
 * 5) Customer name/email can be auto-resolved by phone (pharmacy-scoped).
 */

import { Request, Response } from "express";
import Sale from "../models/Sale";
import Medicine from "../models/Medicine";
import Stats from "../models/Stats";
import Customer from "../models/Customer";
import { SaleInput, CartItem } from "../types/sale";
import { v4 as uuidv4 } from "uuid";

/**
 * Small helper: normalize user-entered phone
 */
function normalizePhone(phone: any) {
  return String(phone ?? "").trim();
}

/**
 * @route POST /api/sales
 * @desc Record a new sale (POS transaction)
 * @access Protected (requires valid JWT with pharmacyId)
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

    if (typeof data.paidAmount !== "number" || !Number.isFinite(data.paidAmount)) {
      return res.status(400).json({ message: "paidAmount must be a valid number." });
    }

    // -------------------------------
    // 2️⃣ Resolve customer details (optional, but auto-fill name/email if phone is given)
    //    IMPORTANT: Must be scoped by pharmacyId to avoid cross-pharmacy leakage
    // -------------------------------
    const phone = data.customerPhone ? normalizePhone(data.customerPhone) : "";
    let resolvedCustomerName: string | undefined = data.customerName?.trim() || undefined;
    let resolvedCustomerEmail: string | undefined = data.customerEmail?.trim() || undefined;

    if (phone) {
      const customer = await Customer.findOne({ pharmacyId, phone }).select("name email");
      if (customer) {
        resolvedCustomerName = customer.name || resolvedCustomerName;
        resolvedCustomerEmail = (customer as any).email || resolvedCustomerEmail;
      }
    }

    // -------------------------------
    // 3️⃣ Check stock and calculate totals (pharmacy-scoped)
    // -------------------------------
    let totalAmount = 0;
    const saleItems: CartItem[] = [];

    for (const item of data.items) {
      const medicine = await Medicine.findOne({
        pharmacyId,
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
    // 4️⃣ Validate paid amount & compute change
    // -------------------------------
    const change = data.paidAmount - totalAmount;

    if (change < 0) {
      return res.status(400).json({
        message: "Paid amount is less than total amount.",
        totalAmount,
        paidAmount: data.paidAmount,
        change,
      });
    }

    // -------------------------------
    // 5️⃣ Deduct stock (pharmacy-scoped)
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
    // 6️⃣ Save sale record with resolved customerName/email
    // NOTE: Your Sale schema does NOT contain customerId, so we do not set it.
    // -------------------------------
    const saleRecord = await Sale.create({
      pharmacyId,
      saleId: uuidv4(),
      items: saleItems,
      totalAmount,
      paidAmount: data.paidAmount,
      change,
      customerName: resolvedCustomerName,
      customerPhone: phone || undefined,
      customerEmail: resolvedCustomerEmail,
      paymentMethod: data.paymentMethod,
      invoiceNumber: `INV-${Date.now()}`,
    });

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
