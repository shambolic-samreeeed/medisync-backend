/**
 * @file controller/saleController.ts
 * @description
 * Sale controller for MediSync POS (multi-pharmacy safe)
 */

import { Request, Response } from "express";
import Sale from "../models/Sale";
import Medicine from "../models/Medicine";
import Customer from "../models/Customer";
import { SaleInput, CartItem } from "../types/sale";
import { v4 as uuidv4 } from "uuid";

function normalizePhone(phone: any) {
  return String(phone ?? "").trim();
}

export const createSale = async (req: Request, res: Response) => {
  try {
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

    let totalAmount = 0;
    const saleItems: CartItem[] = [];

    for (const item of data.items) {
      const medicine = await Medicine.findOne({
        pharmacyId,
        medicineId: item.medicineId,
        batchNo: item.batchNo,
      });

      if (!medicine) {
        return res.status(404).json({ message: `Medicine ${item.medicineId} batch ${item.batchNo} not found.` });
      }

      if (medicine.stock < item.quantity) {
        return res.status(400).json({ message: `Not enough stock for ${medicine.name} batch ${item.batchNo}.` });
      }

      // 🚀 THE FIX: Use medicine.sellingPrice instead of unitPrice to calculate the bill!
      const itemTotal = medicine.sellingPrice * item.quantity;
      totalAmount += itemTotal;

      saleItems.push({
        medicineId: item.medicineId,
        batchNo: medicine.batchNo,
        name: medicine.name,
        
        // We keep the key as "unitPrice" here so we don't break your frontend Receipt/Cart types, 
        // but we feed it the actual sellingPrice from the database!
        unitPrice: medicine.sellingPrice, 
        quantity: item.quantity,
        total: itemTotal,
      });
    }

    const change = data.paidAmount - totalAmount;

    if (change < 0) {
      return res.status(400).json({
        message: "Paid amount is less than total amount.",
        totalAmount,
        paidAmount: data.paidAmount,
        change,
      });
    }

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

    return res.status(201).json({
      message: "Sale recorded successfully",
      sale: saleRecord,
    });
  } catch (error: any) {
    console.error("Create Sale Error:", error);
    return res.status(500).json({
      message: "Failed to process sale",
      error: error?.message || error,
    });
  }
};