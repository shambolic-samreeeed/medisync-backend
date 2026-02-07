import { Request, Response } from "express";
import Sale from "../models/Sale";
import Medicine from "../models/Medicine";
import { SaleInput, CartItem } from "../types/sale";
import { v4 as uuidv4 } from "uuid";

// POST /api/sales
export const createSale = async (req: Request, res: Response) => {
  try {
    const data: SaleInput = req.body;

    if (!data.items || data.items.length === 0) {
      return res.status(400).json({ message: "No items provided for sale." });
    }

    let totalAmount = 0;
    const saleItems: CartItem[] = [];

    // Check stock and calculate totals
    for (const item of data.items) {
      const medicine = await Medicine.findOne({ medicineId: item.medicineId, batchNo: item.batchNo });
      if (!medicine) {
        return res.status(404).json({ message: `Medicine ${item.medicineId} batch ${item.batchNo} not found.` });
      }

      if (medicine.stock < item.quantity) {
        return res.status(400).json({ message: `Not enough stock for ${medicine.name} batch ${item.batchNo}.` });
      }

      const total = medicine.unitPrice * item.quantity;
      totalAmount += total;

      saleItems.push({
        medicineId: medicine.medicineId,
        batchNo: medicine.batchNo,
        name: medicine.name,
        unitPrice: medicine.unitPrice,
        quantity: item.quantity,
        total,
      });
    }

    // Deduct stock
    for (const item of data.items) {
      await Medicine.findOneAndUpdate(
        { medicineId: item.medicineId, batchNo: item.batchNo },
        { $inc: { stock: -item.quantity } }
      );
    }

    const change = data.paidAmount - totalAmount;

    const saleRecord = new Sale({
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

    res.status(201).json({
      message: "Sale recorded successfully",
      sale: saleRecord,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to process sale", error });
  }
};
