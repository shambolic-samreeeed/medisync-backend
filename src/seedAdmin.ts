import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { User } from "./models/User";
import dotenv from "dotenv";

dotenv.config();

async function seedAdmin() {
  try {
    // 1. connect to database
    await mongoose.connect(process.env.MONGO_URI as string);

    // 2. check if admin already exists
    const adminExists = await User.findOne({ role: "ADMIN" });
    if (adminExists) {
      console.log("Admin already exists");
      process.exit(0);
    }

    // 3. hash password
    const hashedPassword = await bcrypt.hash("123456", 10);

    // 4. create admin
    await User.create({
      userId: uuidv4(),
      firstName: "Hero",
      lastName: "Admin",
      email: "lamine@example.com",
      password: hashedPassword,
      role: "ADMIN",
    });

    console.log("Admin created successfully");
    console.log("Email: lamine@example.com");
    console.log("Password: 123456");

    process.exit(0);
  } catch (error) {
    console.error("Error seeding admin:", error);
    process.exit(1);
  }
}

seedAdmin();
