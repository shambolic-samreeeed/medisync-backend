import {Router} from "express";
import { getAllUsers, getUsersByRole, getCurrentUser } from "../controller/userController";
import { adminOnly } from "../middlewares/adminsOnly";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

//fetch current user (must be before /:id routes)
router.get("/me", authMiddleware, getCurrentUser);

//fetch all users
router.get("/all", authMiddleware, adminOnly, getAllUsers);

//fetch users by role
router.get("/role", authMiddleware, adminOnly, getUsersByRole);

export default router;