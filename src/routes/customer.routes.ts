import { Router } from "express";
import { createCustomer, deleteCustomer, getCustomerById, getCustomers, updateCustomer } from "../controller/customerController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.use(authMiddleware);

router.post("/", createCustomer);
router.get("/", getCustomers);
router.get("/:id", getCustomerById);
router.put("/:id", updateCustomer);
router.delete("/:id", deleteCustomer);

export default router;
