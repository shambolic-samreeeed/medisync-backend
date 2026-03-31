import { Request, Response, NextFunction } from "express";

export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN" && !user.pharmacyId) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admins only.",
    });
  }

  next();
};
