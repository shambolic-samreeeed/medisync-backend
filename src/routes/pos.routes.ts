import { Router } from "express";
import { getSellableMedicinesForPOS } from "../controller/posController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// SECURITY FIX: was using `authenticate` (JWT-decode only, stale pharmacyId risk).
// authMiddleware always loads pharmacyId fresh from the DB on every request.
router.get("/medicines", authMiddleware, getSellableMedicinesForPOS);

export default router;