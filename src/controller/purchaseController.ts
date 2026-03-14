import { Request, Response } from "express";
import mongoose from "mongoose";
import Purchase from "../models/Purchase";
import Supplier from "../models/Supplier";

/**
 * Lean type updated with new financial fields and payment history
 */
type PurchaseLean = {
  _id: mongoose.Types.ObjectId;
  invoiceNumber: string;
  purchaseDate: Date;
  dueDate: Date;         
  totalAmount: number;   
  paidAmount: number;    
  paymentStatus: string; 
  paymentHistory: Array<{
    amount: number;
    date: Date;
    method: string;
    notes?: string;
  }>;
  supplierId: any;
  items: Array<{
    medicineId: string;
    name: string;
    batchNo: string;
    quantity: number;
    unitPrice: number;
    expiryDate: Date;
    supplier?: string;
  }>;
  createdAt: Date;
};

/**
 * 🚀 GET /api/purchases
 * Returns ALL purchase invoices for the dashboard.
 */
export const getAllPurchases = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) return res.status(401).json({ message: "Unauthorized" });

    const purchases = await Purchase.find({ pharmacyId })
      .populate("supplierId", "name")
      .sort({ purchaseDate: -1, createdAt: -1 })
      .lean();

    return res.status(200).json(purchases);
  } catch (error: any) {
    return res.status(500).json({ message: "Failed to fetch purchases", error: error.message });
  }
};

/**
 * GET /api/suppliers/:supplierId/purchases
 * Filtered list for a specific supplier profile
 */
export const getSupplierPurchases = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    const { supplierId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(supplierId)) {
      return res.status(400).json({ message: "Invalid supplierId" });
    }

    const supplier = await Supplier.findOne({ _id: supplierId, pharmacyId }).select("_id name");
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const filter = { pharmacyId, supplierId: supplier._id };

    const [total, purchases] = await Promise.all([
      Purchase.countDocuments(filter),
      Purchase.find(filter)
        .sort({ purchaseDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      supplier,
      page,
      total,
      totalPages: Math.ceil(total / limit),
      data: purchases,
    });
  } catch (error: any) {
    return res.status(500).json({ message: "Error", error: error.message });
  }
};

/**
 * GET /api/purchases/:purchaseId
 * Returns full details of ONE invoice (including history & items)
 */
export const getPurchaseById = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    const { purchaseId } = req.params;

    const purchase = await Purchase.findOne({ _id: purchaseId, pharmacyId })
      .populate("supplierId", "name text contact")
      .lean<PurchaseLean | null>();

    if (!purchase) return res.status(404).json({ message: "Purchase not found" });

    return res.status(200).json(purchase);
  } catch (error: any) {
    return res.status(500).json({ message: "Error", error: error.message });
  }
};

/**
 * 🚀 PATCH /api/purchases/:purchaseId/payment
 * Logs a payment, saves the history, and updates status (UNPAID -> PARTIAL -> PAID)
 */
export const updatePurchasePayment = async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    const { purchaseId } = req.params;
    
    // Extract payment details, defaulting if not provided
    const { amountPaid, paymentMethod = "CASH", notes = "" } = req.body; 

    const numericAmount = Number(amountPaid);

    // 1. Strict Validation
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ message: "Invalid payment amount. Ensure the frontend is sending JSON correctly." });
    }

    const purchase = await Purchase.findOne({ _id: purchaseId, pharmacyId });
    if (!purchase) return res.status(404).json({ message: "Invoice not found" });

    const currentPaid = purchase.paidAmount || 0;
    const newTotalPaid = currentPaid + numericAmount;

    // 2. Prevent overpaying
    if (newTotalPaid > purchase.totalAmount) {
      return res.status(400).json({ message: "Payment exceeds the total invoice amount" });
    }

    // 3. Update financial logic
    purchase.paidAmount = newTotalPaid;

    if (newTotalPaid >= purchase.totalAmount) {
      purchase.paymentStatus = "PAID";
    } else if (newTotalPaid > 0) {
      purchase.paymentStatus = "PARTIAL";
    }

    // 4. 🚀 Record the payment history
    purchase.paymentHistory.push({
      amount: numericAmount,
      date: new Date(),
      method: paymentMethod as "CASH" | "BANK" | "CHEQUE",
      notes: notes
    });

    await purchase.save();

    return res.status(200).json({ 
      message: "Payment updated successfully ✅", 
      data: purchase 
    });
  } catch (error: any) {
    return res.status(500).json({ message: "Payment update failed", error: error.message });
  }
};