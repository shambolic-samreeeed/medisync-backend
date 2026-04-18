import { Request, Response } from "express";
import Pharmacy from "../models/Pharmacy";
import mongoose from "mongoose";
import { email } from "zod";

/**
 * Helper: Add 1 month to current date
 */
const getNextMonthDate = () => {
  const now = new Date();
  return new Date(now.setMonth(now.getMonth() + 1));
};

/**
 * POST /api/pharmacies
 * Create a new pharmacy (ADMIN only)
 */
export const createPharmacy = async (req: Request, res: Response) => {
  try {
    const requester = (req as any).user;

    if (!requester) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (requester.role !== "ADMIN")
      return res.status(403).json({ success: false, message: "Only admins can create pharmacies" });

    const { name, address, phone, email } = req.body;

    if (!name) return res.status(400).json({ success: false, message: "Pharmacy name is required" });

    const existingPharmacy = await Pharmacy.findOne({ name });
    if (existingPharmacy)
      return res.status(409).json({ success: false, message: "Pharmacy already exists" });

    const now = new Date();

    const pharmacy = await Pharmacy.create({
      name,
      address,
      phone,
      email,
      plan: "STARTER",        // ✅ matches schema
      planStartDate: now,
      planEndDate: getNextMonthDate(),
      paymentStatus: "UNPAID", // ✅ matches schema
      status: "ACTIVE",
    });

    return res.status(201).json({ success: true, message: "Pharmacy created successfully", data: pharmacy });
  } catch (err) {
    console.error("Create pharmacy error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};

/**
 * GET /api/pharmacies
 */
export const getAllPharmacies = async (req: Request, res: Response) => {
  try {
    const requester = (req as any).user;
    if (!requester) return res.status(401).json({ success: false, message: "Unauthorized" });

    const pharmacies = await Pharmacy.find().sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: pharmacies });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};

/**
 * GET /api/pharmacies/:id
 */
export const getPharmacyById = async (req: Request, res: Response) => {
  try {
    const requester = (req as any).user;
    if (!requester) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid pharmacy ID" });

    const pharmacy = await Pharmacy.findById(id);
    if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found" });

    return res.status(200).json({ success: true, data: pharmacy });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};

/**
 * PUT /api/pharmacies/:id
 * Update basic info (ADMIN only)
 */
export const updatePharmacy = async (req: Request, res: Response) => {
  try {
    const requester = (req as any).user;
    if (!requester) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (requester.role !== "ADMIN")
      return res.status(403).json({ success: false, message: "Only admins can update pharmacies" });

    const { id } = req.params;
    const { name, address, phone, email } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid pharmacy ID" });

    const updateData: Partial<any> = {};
    if (name) updateData.name = name;
    if (address) updateData.address = address;
    if (phone) updateData.phone = phone;
    if(email) updateData.email = email;

    const updatedPharmacy = await Pharmacy.findByIdAndUpdate(id, { $set: updateData }, { new: true });
    if (!updatedPharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found" });

    return res.status(200).json({ success: true, message: "Pharmacy updated successfully", data: updatedPharmacy });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};

/**
 * PUT /api/pharmacies/:id/plan
 * Update subscription plan (ADMIN only)
 */
export const updatePharmacyPlan = async (req: Request, res: Response) => {
  try {
    const requester = (req as any).user;
    if (!requester || requester.role !== "ADMIN")
      return res.status(403).json({ success: false, message: "Only admins can update plans" });

    const { id } = req.params;
    const { plan } = req.body;

    if (!["STARTER", "PROFESSIONAL", "ENTERPRISE"].includes(plan))
      return res.status(400).json({ success: false, message: "Invalid plan type" });

    const now = new Date();

    const updated = await Pharmacy.findByIdAndUpdate(
      id,
      {
        plan,
        planStartDate: now,
        planEndDate: getNextMonthDate(),
        paymentStatus: "PAID",
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: "Pharmacy not found" });

    return res.status(200).json({ success: true, message: "Plan updated successfully", data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};

/**
 * PUT /api/pharmacies/:id/status
 * Update pharmacy status (ADMIN only)
 */
export const updatePharmacyStatus = async (req: Request, res: Response) => {
  try {
    const requester = (req as any).user;
    if (!requester || requester.role !== "ADMIN")
      return res.status(403).json({ success: false, message: "Only admins can change status" });

    const { id } = req.params;
    const { status } = req.body;

    if (!["ACTIVE", "SUSPENDED", "CANCELLED"].includes(status))
      return res.status(400).json({ success: false, message: "Invalid status" });

    const updated = await Pharmacy.findByIdAndUpdate(id, { status }, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "Pharmacy not found" });

    return res.status(200).json({ success: true, message: "Status updated successfully", data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};

export const updatePharmacySubscriptionManually = async (req: Request, res: Response) => {
  try {
    const requester = (req as any).user;

    if (!requester || requester.role !== "ADMIN") {
      return res.status(403).json({ message: "Only admin can update subscription" });
    }

    const { id } = req.params;

    const {
      status,          // ACTIVE | SUSPENDED | CANCELLED
      paymentStatus,   // PAID | UNPAID | OVERDUE
      extendMonths,    // number (optional)
      setEndDate       // optional manual override
    } = req.body;

    const pharmacy = await Pharmacy.findById(id);

    if (!pharmacy) {
      return res.status(404).json({ message: "Pharmacy not found" });
    }

    const updateData: any = {};

    // 1️⃣ Update status if provided
    if (status) {
      updateData.status = status;
    }

    // 2️⃣ Update payment status if provided
    if (paymentStatus) {
      updateData.paymentStatus = paymentStatus;
    }

    // 3️⃣ Extend subscription (MOST IMPORTANT)
    if (extendMonths && typeof extendMonths === "number") {
      const baseDate = new Date(pharmacy.planEndDate || new Date());

      baseDate.setMonth(baseDate.getMonth() + extendMonths);

      updateData.planEndDate = baseDate;

      // If extending → automatically activate
      updateData.status = "ACTIVE";
      updateData.paymentStatus = "PAID";
    }

    // 4️⃣ Manual override end date (optional)
    if (setEndDate) {
      updateData.planEndDate = new Date(setEndDate);
    }

    const updated = await Pharmacy.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Subscription updated successfully",
      data: updated,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: (err as Error).message,
    });
  }
};

/**
 * PUT /api/pharmacies/:id/payment-status
 * Update payment status of a pharmacy (ADMIN only)
 */
export const updatePharmacyPaymentStatus = async (req: Request, res: Response) => {
  try {
    const requester = (req as any).user;

    if (!requester || requester.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only admins can update payment status",
      });
    }

    const { id } = req.params;
    const paymentStatus = req.body?.paymentStatus;

    if (!paymentStatus || !["PAID", "UNPAID", "OVERDUE"].includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
      });
    }

    const updated = await Pharmacy.findByIdAndUpdate(
      id,
      { paymentStatus },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Pharmacy not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Payment status updated successfully",
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: (err as Error).message,
    });
  }
};

/**
 * DELETE /api/pharmacies/:id
 * Delete a pharmacy (ADMIN only)
 */
export const deletePharmacy = async (req: Request, res: Response) => {
  try {
    const requester = (req as any).user;
    if (!requester) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (requester.role !== "ADMIN")
      return res.status(403).json({ success: false, message: "Only admins can delete pharmacies" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid pharmacy ID" });

    const deletedPharmacy = await Pharmacy.findByIdAndDelete(id);
    if (!deletedPharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found" });

    return res.status(200).json({ success: true, message: "Pharmacy deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: (err as Error).message });
  }
};