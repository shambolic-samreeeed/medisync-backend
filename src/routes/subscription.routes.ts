import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware";
import { Request, Response } from "express";
import Subscription from "../models/Subscription";
import SubscriptionPlan from "../models/SubscriptionPlan";
import PaymentRecord from "../models/PaymentRecord";

const router = Router();

// ✅ PUBLIC — no auth required (used on pricing/landing pages)
router.get("/plans", async (_req: Request, res: Response) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ priceMonthly: 1 });
    return res.json({ success: true, data: plans });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// All routes below this line require auth
router.use(authMiddleware);

router.get("/current", async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) {
      return res.status(403).json({ success: false, message: "No pharmacy context" });
    }

    const subscription = await Subscription.findOne({
      pharmacyId,
      status: { $in: ["TRIAL", "ACTIVE", "SUSPENDED", "EXPIRED"] },
    }).sort({ createdAt: -1 });

    const plan = subscription
      ? await SubscriptionPlan.findOne({ tier: subscription.planTier })
      : null;

    return res.json({ success: true, data: { subscription, plan } });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/payments", async (req: Request, res: Response) => {
  try {
    const pharmacyId = req.user?.pharmacyId;
    if (!pharmacyId) {
      return res.status(403).json({ success: false, message: "No pharmacy context" });
    }

    const payments = await PaymentRecord.find({ pharmacyId }).sort({ createdAt: -1 });
    return res.json({ success: true, data: payments });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;