import { Request, Response } from "express";
import { PharmacySettings } from "../models/PharmacySettings";

// This tells TypeScript what your authMiddleware attached to 'req'
export interface AuthRequest extends Request {
  user?: {
    _id: string;
    role: string;
    pharmacyId: string;
  };
}

export const getSettings = async (req: AuthRequest, res: Response) => {
  try {
    // We can safely use the non-null assertion (!) because authMiddleware guarantees this exists
    const pharmacyId = req.user!.pharmacyId;

    let settings = await PharmacySettings.findOne({ pharmacyId });
    
    // If no settings exist in DB yet, return the default template
    if (!settings) {
      settings = new PharmacySettings({
        pharmacyId,
        esewaMerchantId: "EPAYTEST",
        khaltiPublicKey: ""
      });
    }

    return res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      message: "Error fetching settings", 
      error: error.message 
    });
  }
};

export const updateSettings = async (req: AuthRequest, res: Response) => {
  try {
    const pharmacyId = req.user!.pharmacyId;
    const { esewaMerchantId, khaltiPublicKey } = req.body;

    const updatedSettings = await PharmacySettings.findOneAndUpdate(
      { pharmacyId },
      { esewaMerchantId, khaltiPublicKey },
      { new: true, upsert: true } // Creates it if it doesn't exist yet
    );

    return res.status(200).json({
      success: true,
      message: "Payment settings updated successfully",
      data: updatedSettings
    });
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      message: "Error updating settings", 
      error: error.message 
    });
  }
};