// /routes/customerRoutes.ts
import { Router } from "express";
import { getCustomerByPhone, registerCustomer } from "../controller/customerController";

const router = Router();

router.post("/", registerCustomer); // Register new customer
router.get("/:phone", getCustomerByPhone); // Get customer by phone

export default router;
