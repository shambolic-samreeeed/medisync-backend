import { Router } from "express";
import {
  createCustomer,
  deleteCustomer,
  getCustomerById,
  getCustomers,
  updateCustomer,
} from "../controller/customerController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { pharmacyGuard } from "../middlewares/pharmacyGuard";

const router = Router();

// SECURITY: pharmacyGuard ensures customers are always scoped to the correct pharmacy
router.use(authMiddleware, pharmacyGuard);

router.post("/", createCustomer);
router.get("/", getCustomers);
router.get("/:id", getCustomerById);
router.put("/:id", updateCustomer);
router.delete("/:id", deleteCustomer);

export default router;