// routes/customerRoutes.ts
import { Router } from "express";
import { createCustomer, findCustomerByPhone } from "../controller/customerController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// Register a new customer
router.post("/", authMiddleware, createCustomer);

// Get customer by phone for checkout
router.get("/:phone", authMiddleware, findCustomerByPhone);

export default router;
