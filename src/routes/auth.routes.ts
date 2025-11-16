import { Router } from "express";
import { deleteUserByUserId, login, register } from "../controller/authController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { adminOnly } from "../middlewares/adminsOnly";

const router = Router();

// Register user
router.post("/register", register);

// Login user
router.post("/login", login);

router.delete("/:userId", authMiddleware, adminOnly, deleteUserByUserId)


export default router;
