import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authorization token missing" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string); // ✅ matches your .env

    (req as any).user = decoded;
    next();
  } catch (err) {
    console.log("JWT VERIFY FAILED:", err);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};
