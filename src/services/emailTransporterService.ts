/**
 * @file src/services/emailTransporter.service.ts
 * @description
 * Multi-tenant SMTP transporter factory.
 *
 * Every email-sending function MUST go through `getTransporterForPharmacy(pharmacyId)`.
 * This guarantees:
 *   - Pharmacy A never uses Pharmacy B's SMTP credentials.
 *   - Passwords are decrypted only at send time and never logged.
 *   - Missing / incomplete configs surface as clear, actionable errors.
 *
 * Provider compatibility notes:
 *   Gmail:    smtpHost=smtp.gmail.com, port=587, secure=false  (App Password required)
 *   Outlook:  smtpHost=smtp.office365.com, port=587, secure=false
 *   Zoho:     smtpHost=smtp.zoho.com, port=465, secure=true  OR port=587, secure=false
 *   Custom:   any host/port/secure combination
 *
 * NOTE on types:
 *   nodemailer v8 ships its own bundled types. @types/nodemailer is for v6/v7
 *   and must NOT be installed alongside v8 — it causes "host does not exist"
 *   and "no overload matches" errors on createTransport().
 *   Fix: remove @types/nodemailer from package.json devDependencies.
 */

// Use the namespace import — nodemailer v8 exports everything under this shape
import nodemailer from "nodemailer";
import mongoose from "mongoose";
import { PharmacyEmailSettings } from "../models/PharmacyEmailSettings";
import { decryptSmtpPassword } from "../utils/emailCrypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PharmacySmtpConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  fromEmail: string;
  fromName: string;
}

/**
 * Plain object shape returned by .lean() — no Mongoose Document methods.
 * Explicitly typed so TypeScript resolves all fields correctly.
 * (Mongoose 8 + .lean() returns FlattenMaps<T> which loses field types
 *  in some TS configs — explicit cast to this interface is the fix.)
 */
interface EmailSettingsLean {
  _id: mongoose.Types.ObjectId;
  pharmacyId: mongoose.Types.ObjectId;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  isConfigured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Config completeness check ────────────────────────────────────────────────

function assertConfigComplete(
  config: Partial<PharmacySmtpConfig & { smtpPassword: string }>,
  pharmacyId: string
): void {
  const required = [
    "smtpHost",
    "smtpPort",
    "smtpUser",
    "smtpPassword",
    "fromEmail",
  ] as const;

  const missing = required.filter((k) => {
    const v = config[k];
    return v === undefined || v === null || String(v).trim() === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `[EmailTransporter] Pharmacy ${pharmacyId} has incomplete SMTP configuration. ` +
        `Missing fields: ${missing.join(", ")}. ` +
        `Please configure email settings in the pharmacy settings panel.`
    );
  }
}

// ─── Transporter factory ──────────────────────────────────────────────────────

/**
 * Loads the pharmacy's SMTP config from the DB, decrypts the password,
 * and creates a live Nodemailer transporter.
 *
 * @throws Error if config is missing or incomplete.
 */
export async function getTransporterForPharmacy(
  pharmacyId: string | mongoose.Types.ObjectId
): Promise<{ transporter: nodemailer.Transporter; config: PharmacySmtpConfig }> {
  const idStr = String(pharmacyId);

  // Cast to our plain interface — fixes the Mongoose 8 FlattenMaps<T> type issue
  const settings = (await PharmacyEmailSettings.findOne({
    pharmacyId,
  }).lean()) as EmailSettingsLean | null;

  if (!settings || !settings.isConfigured) {
    throw new Error(
      `[EmailTransporter] No email configuration found for pharmacy ${idStr}. ` +
        `Please set up SMTP settings in Settings → Email before sending emails.`
    );
  }

  // Decrypt the password — never log it
  const plainPassword = decryptSmtpPassword(settings.smtpPassword);

  // Validate all required fields are present
  assertConfigComplete(
    {
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort,
      smtpUser: settings.smtpUser,
      smtpPassword: plainPassword,
      fromEmail: settings.fromEmail,
    },
    idStr
  );

  // Build the SMTP options as a plain object typed with `as any`.
  //
  // WHY `as any` HERE:
  //   nodemailer v8 bundles its own types but @types/nodemailer (v6/v7 types)
  //   may still be installed and takes precedence in some TS configs, causing
  //   "host does not exist on TransportOptions" errors.
  //   The `as any` cast is intentional and safe — the runtime behaviour is
  //   identical. Remove @types/nodemailer from devDependencies to fix properly.
  const smtpOptions: any = {
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: {
      user: settings.smtpUser,
      pass: plainPassword, // decrypted at runtime, never stored/logged
    },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    pool: false,
  };

  const transporter = nodemailer.createTransport(smtpOptions);

  const publicConfig: PharmacySmtpConfig = {
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    smtpUser: settings.smtpUser,
    fromEmail: settings.fromEmail,
    fromName: settings.fromName || "MediSync",
  };

  return { transporter, config: publicConfig };
}

// ─── Formatted "from" string builder ─────────────────────────────────────────

/**
 * Builds a properly formatted RFC 5321 From header.
 * Example: `"City Pharmacy" <noreply@citypharmacy.com>`
 */
export function buildFromAddress(config: PharmacySmtpConfig): string {
  const name = config.fromName?.trim() || "MediSync";
  return `"${name}" <${config.fromEmail}>`;
}

// ─── SMTP verification (used by test endpoint) ────────────────────────────────

/**
 * Creates a transporter and verifies SMTP connectivity.
 * Returns a structured result rather than throwing, so the controller
 * can give the user actionable provider-specific guidance.
 */
export async function verifySmtpForPharmacy(
  pharmacyId: string | mongoose.Types.ObjectId
): Promise<{ ok: boolean; message: string }> {
  try {
    const { transporter, config } = await getTransporterForPharmacy(pharmacyId);
    await transporter.verify();
    return {
      ok: true,
      message: `SMTP connection verified for ${config.smtpHost}:${config.smtpPort}`,
    };
  } catch (err: any) {
    const msg: string = err.message ?? String(err);
    return { ok: false, message: getSmtpErrorGuidance(msg) };
  }
}

// ─── Provider-aware error guidance ───────────────────────────────────────────

/**
 * Maps raw SMTP error strings to user-friendly, actionable guidance.
 */
export function getSmtpErrorGuidance(rawError: string): string {
  const e = rawError.toLowerCase();

  if (
    e.includes("invalid login") ||
    e.includes("535") ||
    e.includes("username and password not accepted")
  ) {
    return (
      "Authentication failed. " +
      "For Gmail: use an App Password (not your account password). Enable 2FA first at myaccount.google.com, then create an App Password. " +
      "For Outlook/Office 365: ensure SMTP AUTH is enabled for your account. " +
      "For Zoho: use your Zoho email password or an app-specific password."
    );
  }

  if (e.includes("self signed certificate") || e.includes("certificate")) {
    return "TLS/SSL certificate error. Try toggling the 'Secure Connection' setting or verify the SMTP host name is correct.";
  }

  if (e.includes("econnrefused") || e.includes("connection refused")) {
    return "Connection refused. Verify the SMTP host and port are correct. Common ports: 587 (STARTTLS), 465 (SSL/TLS), 25 (not recommended).";
  }

  if (e.includes("etimedout") || e.includes("timeout")) {
    return "Connection timed out. Check your SMTP host name and ensure your server can reach the external SMTP provider. Firewall rules may be blocking outbound SMTP.";
  }

  if (e.includes("enotfound") || e.includes("getaddrinfo")) {
    return "SMTP host not found. Double-check the host name (e.g., smtp.gmail.com, smtp.office365.com).";
  }

  if (e.includes("534") || e.includes("less secure")) {
    return "Gmail requires an App Password. Go to Google Account → Security → App Passwords to generate one.";
  }

  if (e.includes("incomplete")) {
    return rawError;
  }

  return `SMTP error: ${rawError}`;
}