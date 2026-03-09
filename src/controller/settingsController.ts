// controllers/settingsController.ts
import { Request, Response } from "express";
import crypto from "crypto";
import { PharmacySettings } from "../models/PharmacySettings";

// Define what your authMiddleware attached to 'req'
export interface AuthRequest extends Request {
  user?: {
    _id: string;
    role: string;
    pharmacyId: string;
  };
}

// GET: Fetch Settings
export const getSettings = async (req: AuthRequest, res: Response) => {
  try {
    const pharmacyId = req.user!.pharmacyId;
    let settings = await PharmacySettings.findOne({ pharmacyId });
    
    if (!settings) {
      settings = new PharmacySettings({
        pharmacyId,
        esewaMerchantId: "EPAYTEST",
        khaltiPublicKey: ""
      });
    }

    return res.status(200).json({ success: true, data: settings });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error fetching settings", error: error.message });
  }
};

// PUT: Update Settings
export const updateSettings = async (req: AuthRequest, res: Response) => {
  try {
    const pharmacyId = req.user!.pharmacyId;
    const { esewaMerchantId, khaltiPublicKey } = req.body;

    const updatedSettings = await PharmacySettings.findOneAndUpdate(
      { pharmacyId },
      { esewaMerchantId, khaltiPublicKey },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Payment settings updated successfully",
      data: updatedSettings
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error updating settings", error: error.message });
  }
};

// POST: Generate eSewa Signature securely on the server
export const generateEsewaSignature = async (req: AuthRequest, res: Response) => {
  try {
    const { amount, saleId, merchantId } = req.body;

    if (!amount || !saleId || !merchantId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // In a production app, store this in your .env file (e.g., process.env.ESEWA_SECRET_KEY)
    // "8gBm/:&EnhH.1/q" is the official test secret for "EPAYTEST"
    const secretKey = "8gBm/:&EnhH.1/q"; 
    const message = `${amount},${saleId},${merchantId}`;

    const signature = crypto
      .createHmac("sha256", secretKey)
      .update(message)
      .digest("base64");

    return res.status(200).json({
      success: true,
      data: { signature }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error generating signature", error: error.message });
  }
};