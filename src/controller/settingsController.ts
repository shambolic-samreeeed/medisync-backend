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

// ==========================================
// 1. GET: Fetch Pharmacy Settings
// ==========================================
export const getSettings = async (req: AuthRequest, res: Response) => {
  try {
    const pharmacyId = req.user!.pharmacyId;
    let settings = await PharmacySettings.findOne({ pharmacyId });
    
    // If this is a brand new pharmacy and they have no settings yet...
    if (!settings) {
      settings = new PharmacySettings({
        pharmacyId,
        esewaMerchantId: "EPAYTEST",
        khaltiPublicKey: "",
        khaltiSecretKey: "", 
        qrMethods: []
      });
      // FIX: Actually save the newly created default settings to the database!
      await settings.save();
    }

    return res.status(200).json({ success: true, data: settings });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error fetching settings", error: error.message });
  }
};

// ==========================================
// 2. PUT: Update Payment Keys (Upsert)
// ==========================================
export const updateSettings = async (req: AuthRequest, res: Response) => {
  try {
    const pharmacyId = req.user!.pharmacyId;
    
    // FIX: Extract the khaltiSecretKey from the frontend request
    const { esewaMerchantId, khaltiPublicKey, khaltiSecretKey } = req.body;

    const updatedSettings = await PharmacySettings.findOneAndUpdate(
      { pharmacyId },
      // FIX: Tell Mongoose to save the khaltiSecretKey
      { esewaMerchantId, khaltiPublicKey, khaltiSecretKey },
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

// ==========================================
// 3. POST: Upload Static QR Image
// ==========================================
export const uploadQR = async (req: AuthRequest, res: Response) => {
  try {
    const pharmacyId = req.user!.pharmacyId;
    const { provider } = req.body; // e.g., "eSewa", "Khalti", "Fonepay"

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const imageUrl = `/uploads/qrs/${req.file.filename}`;

    // Remove the old QR image for this provider (if it exists) and return the document
    const settings = await PharmacySettings.findOneAndUpdate(
      { pharmacyId },
      { $pull: { qrMethods: { provider } } }, 
      { upsert: true, new: true }
    );

    // Push the new uploaded image URL into the array
    settings.qrMethods.push({ provider, imageUrl });
    await settings.save();

    return res.status(200).json({ success: true, message: "QR uploaded successfully", data: settings });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error uploading QR", error: error.message });
  }
};

// ==========================================
// 4. POST: Generate eSewa Signature
// ==========================================
export const generateEsewaSignature = async (req: AuthRequest, res: Response) => {
  try {
    const { amount, saleId, merchantId } = req.body;

    if (!amount || !saleId || !merchantId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const secretKey = "8gBm/:&EnhH.1/q"; // Official test secret for "EPAYTEST"
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