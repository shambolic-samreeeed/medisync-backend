import mongoose, { Document, Model, Schema } from "mongoose";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

export interface IUser extends Document {
  userId: string; // uuid
  pharmacyId?: mongoose.Types.ObjectId; // optional except pharmacist
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: "ADMIN" | "PHARMACIST" | "DOCTOR" | "PATIENT";
  comparePassword(password: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    userId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
    },

    // ✅ Only required for PHARMACIST
    pharmacyId: {
  type: Schema.Types.ObjectId,
  ref: "Pharmacy",
  required: function (this: any) {
    return this.role === "PHARMACIST";
  },
},


    firstName: { type: String, required: true },
    lastName: { type: String, required: true },

    email: { type: String, required: [true, "Email is required"], unique: true, lowercase: true, trim: true },

    password: { type: String, required: [true, "Password is required"] },

    role: {
      type: String,
      enum: ["ADMIN", "PHARMACIST", "DOCTOR", "PATIENT"],
      required: true,
      // ✅ remove default pharmacist (avoid accidental pharmacist creation)
      // default: "PHARMACIST",
    },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = function (password: string) {
  return bcrypt.compare(password, this.password);
};

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
