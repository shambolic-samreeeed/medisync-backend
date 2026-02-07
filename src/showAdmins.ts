import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "./models/User";

dotenv.config();

async function showAdmins() {
  await mongoose.connect(process.env.MONGO_URI as string);

  const admins = await User.find({ role: "ADMIN" }).select("email firstName lastName userId");
  console.log(admins);

  process.exit(0);
}

showAdmins().catch((e) => {
  console.error(e);
  process.exit(1);
});
