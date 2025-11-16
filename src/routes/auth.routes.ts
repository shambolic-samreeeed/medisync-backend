import { Router } from "express";
import { deleteUserByUserId, login, register, updateUser } from "../controller/authController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { adminOnly } from "../middlewares/adminsOnly";

const router = Router();

// register user
router.post("/register", register);

// login user
router.post("/login", login);

// delete users by id
router.delete("/:userId", authMiddleware, adminOnly, deleteUserByUserId)

//update user details
router.put("/:userId", authMiddleware, updateUser);

//update user password
router.put("/:userId/password", authMiddleware, updateUser);

export default router;
