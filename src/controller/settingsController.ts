import { Request, Response } from "express";
import crypto from "crypto";
import { PharmacySettings } from "../models/PharmacySettings";

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
    
    if (!settings) {
      settings = new PharmacySettings({
        pharmacyId,
        esewaMerchantId: "EPAYTEST",
        khaltiPublicKey: "",
        khaltiSecretKey: "", 
        qrMethods: []
      });
      await settings.save();
    }

    return res.status(200).json({ success: true, data: settings });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error fetching settings", error: error.message });
  }
};

// ==========================================
// 2. PUT: Update Payment Keys
// ==========================================
export const updateSettings = async (req: AuthRequest, res: Response) => {
  try {
    const pharmacyId = req.user!.pharmacyId;
    const { esewaMerchantId, khaltiPublicKey, khaltiSecretKey } = req.body;

    const updatedSettings = await PharmacySettings.findOneAndUpdate(
      { pharmacyId },
      { esewaMerchantId, khaltiPublicKey, khaltiSecretKey },
      { new: true, upsert: true }
    );

    return res.status(200).json({ success: true, message: "Settings updated", data: updatedSettings });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error updating settings", error: error.message });
  }
};

// ==========================================
// 3. POST: Upload Custom Dynamic QR Image
// ==========================================
export const uploadQR = async (req: AuthRequest, res: Response) => {
  try {
    const pharmacyId = req.user!.pharmacyId;
    const { provider } = req.body; // User can type "Mobile Banking", "Fonepay", etc.

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file uploaded" });
    }
    if (!provider) {
      return res.status(400).json({ success: false, message: "Provider name is required" });
    }

    const imageUrl = `/uploads/qrs/${req.file.filename}`;

    const settings = await PharmacySettings.findOne({ pharmacyId });
    if (!settings) return res.status(404).json({ success: false, message: "Settings not found" });

    // 🚀 Remove the old QR for this specific provider if they are just replacing it
    settings.qrMethods = settings.qrMethods.filter(
      (qr: { provider: string; }) => qr.provider.toLowerCase() !== provider.toLowerCase()
    );

    // Push the newly uploaded image
    settings.qrMethods.push({ provider, imageUrl });
    await settings.save();

    return res.status(200).json({ success: true, message: `${provider} QR uploaded!`, data: settings });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error uploading QR", error: error.message });
  }
};

// ==========================================
// 4. DELETE: Remove a Custom QR
// ==========================================
export const deleteQR = async (req: AuthRequest, res: Response) => {
  try {
    const pharmacyId = req.user!.pharmacyId;
    const { provider } = req.params; // Passed in the URL: /api/settings/qr/Fonepay

    const settings = await PharmacySettings.findOne({ pharmacyId });
    if (!settings) return res.status(404).json({ success: false, message: "Settings not found" });

    // Filter out the provider the user wants to delete
    settings.qrMethods = settings.qrMethods.filter(
      (qr: { provider: string; }) => qr.provider.toLowerCase() !== provider.toLowerCase()
    );

    await settings.save();
    return res.status(200).json({ success: true, message: `${provider} QR deleted`, data: settings });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error deleting QR", error: error.message });
  }
};