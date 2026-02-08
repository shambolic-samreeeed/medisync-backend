/**
 * @file middleware/authMiddleware.ts
 * @description
 * JWT authentication middleware for MediSync.
 *
 * What it does:
 * 1) Reads token from: Authorization: Bearer <token>
 * 2) Verifies JWT
 * 3) Loads the user from DB
 * 4) Attaches req.user = { _id, role, pharmacyId }
 *
 * Why:
 * - Controllers should NEVER accept pharmacyId from frontend.
 * - Backend decides pharmacy from authenticated user.
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

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

    if (!user.pharmacyId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: pharmacyId missing on user. Assign this user to a pharmacy in DB.",
      });
    }

    // Handles both:
    // - pharmacyId as ObjectId
    // - pharmacyId populated object { _id, name }
    const pharmacyId =
      typeof (user.pharmacyId as any) === "object"
        ? (user.pharmacyId as any)._id?.toString?.()
        : user.pharmacyId.toString();

    req.user = {
      _id: user._id.toString(),
      role: user.role,
      pharmacyId,
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
