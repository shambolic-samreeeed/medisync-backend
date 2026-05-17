/**
 * pharmacyGuard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SECURITY MIDDLEWARE — Multi-tenant Isolation Guard
 *
 * PURPOSE:
 *   Ensures every protected route has a valid pharmacyId on req.user BEFORE
 *   the controller runs. This is the architectural safety net that prevents
 *   data leakage between pharmacies, even if a controller accidentally omits
 *   its own pharmacyId check.
 *
 * USAGE:
 *   Apply AFTER authMiddleware on any route that operates on pharmacy-scoped data.
 *
 *   router.get("/dashboard/kpis", authMiddleware, pharmacyGuard, getDashboardKPIs);
 *
 *   Or apply at router level for an entire route file:
 *   router.use(authMiddleware, pharmacyGuard);
 *
 * EXCEPTIONS:
 *   - Super-admin (ADMIN role) routes intentionally have no pharmacyId.
 *     Do NOT apply this guard to superAdmin.routes.ts.
 */

import { Request, Response, NextFunction } from "express";

export const pharmacyGuard = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user as any;

  // ADMIN role is a super-admin with no pharmacy scope — let them through.
  // All other roles MUST have a pharmacyId or they cannot proceed.
  if (user?.role === "ADMIN") {
    return next();
  }

  const pharmacyId = user?.pharmacyId;

  if (!pharmacyId || String(pharmacyId).trim() === "") {
    return res.status(403).json({
      success: false,
      message: "Forbidden: your account is not assigned to a pharmacy. Contact your administrator.",
    });
  }

  return next();
};