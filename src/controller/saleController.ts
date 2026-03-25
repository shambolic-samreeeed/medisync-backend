import { Request, Response } from "express";
import Sale from "../models/Sale";
import Medicine from "../models/Medicine";
import Customer from "../models/Customer";
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

    const data = req.body;

    if (!data.items || data.items.length === 0) {
      return res.status(400).json({ message: "No items provided for sale." });
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
    const saleItems = [];

    // Loop through items to calculate totals AND grab costPrice
    for (const item of data.items) {
      const medicine = await Medicine.findOne({
        pharmacyId,
        medicineId: item.medicineId,
        batchNo: item.batchNo,
      });

      if (!medicine) {
        return res.status(404).json({ message: `Medicine ${item.name} batch ${item.batchNo} not found.` });
      }

      if (medicine.stock < item.quantity) {
        return res.status(400).json({ message: `Not enough stock for ${medicine.name}.` });
      }

      const itemTotal = medicine.sellingPrice * item.quantity;
      totalAmount += itemTotal;

      // 🚀 THE CRITICAL ADDITION: costPrice
      saleItems.push({
        medicineId: item.medicineId,
        batchNo: medicine.batchNo,
        name: medicine.name,
        unitPrice: medicine.sellingPrice, 
        costPrice: medicine.costPrice, // This makes profit calculation possible!
        quantity: item.quantity,
        total: itemTotal,
      });

      // Update Inventory Stock
      medicine.stock -= item.quantity;
      await medicine.save();
    }

    const change = data.paidAmount - totalAmount;

    if (change < 0) {
      return res.status(400).json({ message: "Paid amount is insufficient.", totalAmount });
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
      success: true,
      message: "Sale recorded successfully ✅",
      sale: saleRecord,
    });
  } catch (error: any) {
    console.error("Create Sale Error:", error);
    return res.status(500).json({ message: "Failed to process sale", error: error.message });
  }
};