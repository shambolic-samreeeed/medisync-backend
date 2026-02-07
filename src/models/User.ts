import mongoose, { Document, Model, Schema } from "mongoose";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

// TypeScript interface
export interface IUser extends Document {
  userId: string;
  pharmacyId: string | mongoose.Types.ObjectId; // <- fix here
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: "ADMIN" | "PHARMACIST" | "DOCTOR" | "PATIENT";
  comparePassword(password: string): Promise<boolean>;
}

// Mongoose schema for the user collection
const UserSchema = new Schema<IUser>(
  {
    userId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
    },
    pharmacyId: { type: Schema.Types.ObjectId, ref: "Pharmacy", required: true }, 
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: [true, "Email is required"], unique: true },
    password: { type: String, required: [true, "Password is required"] },
    role: {
      type: String,
      enum: ["ADMIN", "PHARMACIST", "DOCTOR", "PATIENT"],
      default: "PHARMACIST",
      required: true,
    },
  },
  { timestamps: true }
);

// Pre-save hook to hash password
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
UserSchema.methods.comparePassword = function (password: string) {
  return bcrypt.compare(password, this.password);
};

// Export the User model
export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
