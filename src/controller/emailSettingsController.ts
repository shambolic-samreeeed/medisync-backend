/**
 * @file src/controller/emailSettingsController.ts
 * @description
 * CRUD + test-send for per-pharmacy SMTP email configuration.
 *
 * Security guarantees enforced here:
 *  1. pharmacyId is ALWAYS sourced from req.user (JWT) — never from req.body.
 *  2. smtpPassword is encrypted before write, never returned in responses.
 *  3. GET responses go through sanitizeEmailSettings() to strip the ciphertext.
 *  4. Errors are normalised through getSmtpErrorGuidance() for actionable messages.
 */

import { Request, Response } from "express";
import { PharmacyEmailSettings, sanitizeEmailSettings } from "../models/PharmacyEmailSettings";
import { encryptSmtpPassword } from "../utils/emailCrypto";
import { buildFromAddress, getSmtpErrorGuidance, getTransporterForPharmacy } from "../services/emailTransporterService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthRequest extends Request {
  user?: {
    _id: string;
    role: string;
    pharmacyId: string;
  };
}

// ─── 1. GET: Fetch email settings (password redacted) ─────────────────────────

/**
 * GET /api/setting/email
 * Returns all SMTP fields except the encrypted password.
 * Includes `smtpPasswordSaved: boolean` so the UI can show a "password is set" indicator.
 */
export const getEmailSettings = async (req: AuthRequest, res: Response) => {
  try {
    const pharmacyId = req.user!.pharmacyId;

    let settings = await PharmacyEmailSettings.findOne({ pharmacyId });

    // Auto-create an empty record on first access so the UI always gets a valid shape
    if (!settings) {
      settings = new PharmacyEmailSettings({
        pharmacyId,
        smtpHost: "",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "",
        smtpPassword: "",
        fromEmail: "",
        fromName: "MediSync",
        isConfigured: false,
      });
      await settings.save();
    }

    return res.status(200).json({
      success: true,
      data: sanitizeEmailSettings(settings),
    });
  } catch (error: any) {
    console.error("[EmailSettingsController] getEmailSettings error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error fetching email settings",
      error: error.message,
    });
  }
};

// ─── 2. PUT: Save / update email settings ─────────────────────────────────────

/**
 * PUT /api/setting/email
 * Accepts all SMTP fields. If smtpPassword is provided (non-empty), it is
 * encrypted and stored. If smtpPassword is omitted or empty, the existing
 * stored password is preserved (allows updating host/port without re-entering password).
 */
export const updateEmailSettings = async (req: AuthRequest, res: Response) => {
  try {
    const pharmacyId = req.user!.pharmacyId;

    const {
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPassword, // plaintext from client — will be encrypted
      fromEmail,
      fromName,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    const errors: string[] = [];

    if (smtpHost !== undefined && String(smtpHost).trim() === "") {
      errors.push("SMTP Host is required");
    }
    if (smtpPort !== undefined) {
      const port = Number(smtpPort);
      if (isNaN(port) || port < 1 || port > 65535) {
        errors.push("SMTP Port must be a valid port number (1-65535)");
      }
    }
    if (smtpUser !== undefined && String(smtpUser).trim() === "") {
      errors.push("SMTP Username is required");
    }
    if (fromEmail !== undefined) {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (String(fromEmail).trim() && !emailRe.test(String(fromEmail).trim())) {
        errors.push("From Email must be a valid email address");
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join(". ") });
    }

    // ── Build update payload ─────────────────────────────────────────────────
    const existing = await PharmacyEmailSettings.findOne({ pharmacyId });

    const updatePayload: Record<string, unknown> = {};

    if (smtpHost !== undefined) updatePayload.smtpHost = String(smtpHost).trim();
    if (smtpPort !== undefined) updatePayload.smtpPort = Number(smtpPort);
    if (smtpSecure !== undefined) updatePayload.smtpSecure = Boolean(smtpSecure);
    if (smtpUser !== undefined) updatePayload.smtpUser = String(smtpUser).trim();
    if (fromEmail !== undefined) updatePayload.fromEmail = String(fromEmail).trim().toLowerCase();
    if (fromName !== undefined) updatePayload.fromName = String(fromName).trim() || "MediSync";

    // Password: encrypt if new value provided, keep existing if omitted
    if (smtpPassword && String(smtpPassword).trim()) {
      updatePayload.smtpPassword = encryptSmtpPassword(String(smtpPassword).trim());
    } else if (!existing?.smtpPassword) {
      // No existing password and none provided — leave blank (isConfigured stays false)
    }
    // else: existing.smtpPassword is kept unchanged

    // Mark as configured once all core fields are present
    const merged = { ...(existing?.toObject() ?? {}), ...updatePayload };
    updatePayload.isConfigured = !!(
      merged.smtpHost &&
      merged.smtpPort &&
      merged.smtpUser &&
      (merged.smtpPassword || updatePayload.smtpPassword) &&
      merged.fromEmail
    );

    const updated = await PharmacyEmailSettings.findOneAndUpdate(
      { pharmacyId },
      { $set: updatePayload },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Email settings saved successfully",
      data: sanitizeEmailSettings(updated),
    });
  } catch (error: any) {
    console.error("[EmailSettingsController] updateEmailSettings error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error saving email settings",
      error: error.message,
    });
  }
};

// ─── 3. POST: Send test email ─────────────────────────────────────────────────

/**
 * POST /api/setting/email/test
 * Body: { recipientEmail: string }
 *
 * - Loads the pharmacy's SMTP config from DB.
 * - Verifies SMTP connectivity.
 * - Sends a test email to the specified address.
 * - Returns provider-specific guidance on failure.
 */
export const sendTestEmail = async (req: AuthRequest, res: Response) => {
  try {
    const pharmacyId = req.user!.pharmacyId;
    const { recipientEmail } = req.body;

    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recipientEmail))) {
      return res.status(400).json({
        success: false,
        message: "A valid recipient email address is required",
      });
    }

    // ── Attempt to build transporter ─────────────────────────────────────────
    let transporter: Awaited<ReturnType<typeof getTransporterForPharmacy>>["transporter"];
    let config: Awaited<ReturnType<typeof getTransporterForPharmacy>>["config"];

    try {
      const result = await getTransporterForPharmacy(pharmacyId);
      transporter = result.transporter;
      config = result.config;
    } catch (configErr: any) {
      return res.status(422).json({
        success: false,
        message: getSmtpErrorGuidance(configErr.message),
      });
    }

    // ── Verify SMTP connection ────────────────────────────────────────────────
    try {
      await transporter.verify();
    } catch (verifyErr: any) {
      return res.status(422).json({
        success: false,
        message: getSmtpErrorGuidance(verifyErr.message),
      });
    }

    // ── Send test email ───────────────────────────────────────────────────────
    const now = new Date();
    const html =
      "<!DOCTYPE html><html><head><meta charset='UTF-8'/></head>" +
      "<body style='margin:0;padding:0;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif;'>" +
      "<table width='100%' cellpadding='0' cellspacing='0' style='background:#f4f4f5;'>" +
      "<tr><td align='center' style='padding:40px 16px;'>" +
      "<table width='100%' cellpadding='0' cellspacing='0' style='max-width:520px;'>" +
      "<tr><td style='background:#059669;height:4px;border-radius:4px 4px 0 0;'></td></tr>" +
      "<tr><td style='background:#fff;padding:32px 40px;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 4px 4px;'>" +
      "<p style='margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#059669;'>MEDISYNC</p>" +
      "<h1 style='margin:0 0 16px;font-size:22px;font-weight:700;color:#18181b;'>Test Email — Connection Successful</h1>" +
      "<p style='margin:0 0 16px;font-size:14px;color:#374151;'>Your SMTP configuration is working correctly. MediSync is now ready to send emails for your pharmacy.</p>" +
      "<table style='background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;width:100%;margin-bottom:16px;'>" +
      "<tr><td style='padding:16px 20px;'>" +
      "<div style='font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#16a34a;margin-bottom:8px;'>SMTP Details</div>" +
      "<div style='font-size:13px;color:#374151;'>" +
      "<div>Host: <strong>" + config.smtpHost + ":" + config.smtpPort + "</strong></div>" +
      "<div>Secure: <strong>" + (config.smtpSecure ? "TLS (port 465)" : "STARTTLS (port 587)") + "</strong></div>" +
      "<div>From: <strong>" + buildFromAddress(config) + "</strong></div>" +
      "<div>Sent at: <strong>" + now.toISOString() + "</strong></div>" +
      "</div></td></tr></table>" +
      "<p style='margin:0;font-size:12px;color:#a1a1aa;'>This is an automated test message from MediSync. No action required.</p>" +
      "</td></tr></table></td></tr></table></body></html>";

    await transporter.sendMail({
      from: buildFromAddress(config),
      to: String(recipientEmail).trim(),
      subject: "MediSync — Test Email (SMTP Connection Successful)",
      html,
    });

    return res.status(200).json({
      success: true,
      message: `Test email sent successfully to ${recipientEmail}. Please check your inbox.`,
    });
  } catch (error: any) {
    console.error("[EmailSettingsController] sendTestEmail error:", error.message);
    return res.status(500).json({
      success: false,
      message: getSmtpErrorGuidance(error.message),
    });
  }
};
