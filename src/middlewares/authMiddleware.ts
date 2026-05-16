import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import Pharmacy from "../models/Pharmacy";

interface JwtPayload {
  id?: string;
  _id?: string;
  sub?: string;
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. No token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Server error: JWT_SECRET not defined",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;

    const userId = decoded.id || decoded._id || decoded.sub;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Invalid token payload",
      });
    }

    // Load user fresh from DB so pharmacyId is always correct
    const user = await User.findById(userId).select("_id role pharmacyId");

    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    // ADMINs have no pharmacyId — let them through without subscription check
    if (user.role !== "ADMIN") {
      if (!user.pharmacyId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: pharmacyId missing on user. Assign this user to a pharmacy in DB.",
        });
      }

      // ── Subscription / Suspension Gate ──────────────────────────────────────
      const pharmacy = await Pharmacy.findById(user.pharmacyId).select("status subscriptionStatus name");
      if (!pharmacy) {
        return res.status(401).json({
          success: false,
          message: "Pharmacy not found. Please contact your administrator.",
        });
      }

      // Block suspended or cancelled pharmacies
      const blockedStatuses = ["SUSPENDED", "CANCELLED"];
      const effectiveStatus = pharmacy.subscriptionStatus ?? pharmacy.status;
      if (blockedStatuses.includes(effectiveStatus)) {
        return res.status(403).json({
          success: false,
          suspended: true,
          message: `Your pharmacy account (${pharmacy.name}) is ${effectiveStatus.toLowerCase()}. Please renew your subscription to continue using MediSync.`,
        });
      }
      // ────────────────────────────────────────────────────────────────────────
    }

    // Handles both:
    // - pharmacyId as ObjectId
    // - pharmacyId populated object { _id, name }
    const pharmacyId =
      typeof (user.pharmacyId as any) === "object"
        ? (user.pharmacyId as any)._id?.toString?.()
        : user.pharmacyId?.toString();

    req.user = {
      _id: user._id.toString(),
      role: user.role,
      pharmacyId: pharmacyId ?? "",
    };

    next();
  } catch (err: any) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      error: err?.message || String(err),
    });
  }
};
