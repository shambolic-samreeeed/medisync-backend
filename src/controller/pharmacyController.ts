import { Request, Response } from "express";
import Pharmacy from "../models/Pharmacy";
import mongoose from "mongoose";

/**
 * POST /api/pharmacies
 * Create a new pharmacy (ADMIN only)
 */
export const createPharmacy = async (req: Request, res: Response) => {
  try {
    const { name, address, phone } = req.body;
    const requester = (req as any).user;

    // Only admin can create pharmacies
    if (requester.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only admins can create pharmacies",
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Pharmacy name is required",
      });
    }

    // Check duplicate pharmacy
    const existingPharmacy = await Pharmacy.findOne({ name });
    if (existingPharmacy) {
      return res.status(409).json({
        success: false,
        message: "Pharmacy already exists",
      });
    }

    const pharmacy = await Pharmacy.create({
      name,
      address,
      phone,
    });

    return res.status(201).json({
      success: true,
      message: "Pharmacy created successfully",
      data: pharmacy,
    });
  } catch (err) {
    console.error("Create pharmacy error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: (err as Error).message,
    });
  }
};

/**
 * GET /api/pharmacies
 * Get all pharmacies
 */
export const getAllPharmacies = async (_req: Request, res: Response) => {
  try {
    const pharmacies = await Pharmacy.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: pharmacies,
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
 * GET /api/pharmacies/:id
 * Get pharmacy by ID
 */
export const getPharmacyById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pharmacy ID",
      });
    }

    const pharmacy = await Pharmacy.findById(id);
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: "Pharmacy not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: pharmacy,
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
 * PUT /api/pharmacies/:id
 * Update pharmacy (ADMIN only)
 */
export const updatePharmacy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, address, phone } = req.body;
    const requester = (req as any).user;

    if (requester.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only admins can update pharmacies",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pharmacy ID",
      });
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (address) updateData.address = address;
    if (phone) updateData.phone = phone;

    const updatedPharmacy = await Pharmacy.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedPharmacy) {
      return res.status(404).json({
        success: false,
        message: "Pharmacy not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pharmacy updated successfully",
      data: updatedPharmacy,
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
 * Delete pharmacy (ADMIN only)
 */
export const deletePharmacy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requester = (req as any).user;

    if (requester.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only admins can delete pharmacies",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pharmacy ID",
      });
    }

    const deletedPharmacy = await Pharmacy.findByIdAndDelete(id);

    if (!deletedPharmacy) {
      return res.status(404).json({
        success: false,
        message: "Pharmacy not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pharmacy deleted successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: (err as Error).message,
    });
  }
};
