import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";
import Batch from "../models/Batch";

const router = Router();

// SECURITY: pharmacyGuard ensures inventory queries are always tenant-isolated
router.use(authMiddleware, pharmacyGuard);

router.get("/products/:productId/batches", async (req, res) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    const { productId } = req.params;
    const batches = await Batch.find({ pharmacyId, productId })
      .sort({ expiryDate: 1, createdAt: -1 })
      .lean();
    return res.json({ success: true, data: batches });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;