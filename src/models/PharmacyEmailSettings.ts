/**
 * @file src/models/PharmacyEmailSettings.ts
 * @description Per-pharmacy SMTP configuration.
 *
 * Security model:
 *  - smtpPassword is stored AES-256 encrypted (never plaintext).
 *  - The decrypt helper in emailCrypto.ts is the only place that reads raw bytes.
 *  - API responses strip smtpPassword entirely via the sanitize() helper below.
 */

import mongoose, { Schema, Document } from "mongoose";

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IPharmacyEmailSettings extends Document {
  pharmacyId: mongoose.Types.ObjectId;

  // SMTP connection
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean; // true = TLS (port 465), false = STARTTLS (port 587)

  // Auth
  smtpUser: string;
  smtpPassword: string; // stored encrypted — never expose raw

  // Sender identity
  fromEmail: string;
  fromName: string;

  // Operational flags
  isConfigured: boolean; // set to true after first successful SAVE

  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const pharmacyEmailSettingsSchema = new Schema<IPharmacyEmailSettings>(
  {
    pharmacyId: {
      type: Schema.Types.ObjectId,
      ref: "Pharmacy",
      required: true,
      unique: true, // one record per pharmacy
      index: true,
    },

    smtpHost: {
      type: String,
      default: "",
      trim: true,
    },
    smtpPort: {
      type: Number,
      default: 587,
    },
    smtpSecure: {
      type: Boolean,
      default: false, // STARTTLS by default (port 587)
    },

    smtpUser: {
      type: String,
      default: "",
      trim: true,
    },
    smtpPassword: {
      type: String,
      default: "", // always stored encrypted
    },

    fromEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    fromName: {
      type: String,
      default: "MediSync",
      trim: true,
    },

    isConfigured: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ─── Static sanitizer — call before sending in API response ──────────────────

/**
 * Strips smtpPassword from a settings document so it is never leaked via API.
 * Also redacts smtpUser length via a masked placeholder so the UI knows
 * whether a password is saved without transmitting the actual value.
 */
export function sanitizeEmailSettings(doc: IPharmacyEmailSettings | null): Record<string, unknown> | null {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  // Replace password with a boolean flag + masked hint
  obj.smtpPasswordSaved = !!(obj.smtpPassword && obj.smtpPassword.length > 0);
  delete obj.smtpPassword;
  return obj;
}

// ─── Model ────────────────────────────────────────────────────────────────────

export const PharmacyEmailSettings =
  mongoose.models.PharmacyEmailSettings ||
  mongoose.model<IPharmacyEmailSettings>("PharmacyEmailSettings", pharmacyEmailSettingsSchema);
