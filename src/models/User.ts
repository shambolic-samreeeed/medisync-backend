import mongoose, { Document, Model } from "mongoose";
import bcrypt from 'bcrypt'

//typescript interface
export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: "ADMIN" | "PHARMACIST" | "DOCTOR" | "PATIENT";
  comparePassword(password: string): Promise<boolean>;
}

//mongoose schema for the user collection.
const UserSchema = new mongoose.Schema<IUser>({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: [true, "Email is required"], unique: true },
  password: { type: String, required: [true, "Password is required"] },
  role: {
    type: String,
    enum: ["ADMIN", "PHARMACIST", "DOCTOR", "PATIENT"],
    default: "PHARMACIST",
    required: [true, "Role is required"],
  },
});

// This function runs BEFORE saving a User document
// It hashes the password if it was modified (new or updated)
UserSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Allows us to call user.comparePassword(inputPassword) to check login
UserSchema.methods.comparePassword = function(password: string) {
  return bcrypt.compare(password, this.password);
};

// Export the User model
export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
