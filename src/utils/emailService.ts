/**
 * @file src/utils/emailService.ts
 * @description
 * MediSync multi-tenant email service.
 *
 * All email-sending functions now accept a `pharmacyId` parameter.
 * The SMTP transporter is loaded dynamically from the pharmacy's DB config —
 * no global credentials, no shared state between pharmacies.
 *
 * Architecture:
 *   Controller / Job  →  emailService function (this file)
 *                        └→ getTransporterForPharmacy(pharmacyId)
 *                           └→ PharmacyEmailSettings (DB)
 *                              └→ decryptSmtpPassword()
 *                                 └→ nodemailer.createTransport()
 */

import { buildFromAddress, getTransporterForPharmacy } from "../services/emailTransporterService";


// ─── Shared formatting helpers ────────────────────────────────────────────────

function money(n: number): string {
  return "Rs. " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtTime(d: Date): string {
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function divider(): string {
  return (
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">' +
    '<tr><td style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    "</table>"
  );
}

function wrap(previewText: string, accentColor: string, header: string, body: string): string {
  return (
    "<!DOCTYPE html>" +
    '<html lang="en">' +
    "<head><meta charset=\"UTF-8\"/>" +
    '<meta name="viewport" content="width=device-width,initial-scale=1.0"/>' +
    "<title>MediSync</title></head>" +
    '<body style="margin:0;padding:0;background:#f4f4f5;font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif;color:#18181b;">' +
    '<div style="display:none;max-height:0;overflow:hidden;">' + previewText + "</div>" +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;">' +
    '<tr><td align="center" style="padding:40px 16px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">' +
    '<tr><td style="background:' + accentColor + ';height:4px;border-radius:4px 4px 0 0;"></td></tr>' +
    '<tr><td style="background:#ffffff;padding:28px 40px 20px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">' +
    '<p style="margin:0;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:' + accentColor + ';">MEDISYNC</p>' +
    "</td></tr>" +
    '<tr><td style="background:#ffffff;padding:0 40px 28px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">' +
    header +
    "</td></tr>" +
    '<tr><td style="background:#ffffff;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;padding:0 40px;">' +
    '<div style="border-top:1px solid #f0f0f0;"></div></td></tr>' +
    '<tr><td style="background:#ffffff;padding:28px 40px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">' +
    body +
    "</td></tr>" +
    '<tr><td style="background:#fafafa;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 4px 4px;padding:20px 40px;text-align:center;">' +
    '<p style="margin:0;font-size:11px;color:#a1a1aa;letter-spacing:0.3px;">This is an automated message from MediSync. Please do not reply to this email.</p>' +
    "</td></tr>" +
    "</table></td></tr></table></body></html>"
  );
}

function metaCell(label: string, value: string, align: string = "left"): string {
  return (
    '<td style="padding:0;text-align:' + align + ';vertical-align:top;">' +
    '<div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#a1a1aa;margin-bottom:5px;">' + label + "</div>" +
    '<div style="font-size:14px;font-weight:600;color:#18181b;">' + value + "</div>" +
    "</td>"
  );
}

function statBox(label: string, value: string, color: string = "#18181b"): string {
  return (
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:6px;">' +
    '<tr><td style="padding:16px 18px;">' +
    '<div style="font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#a1a1aa;margin-bottom:6px;">' + label + "</div>" +
    '<div style="font-size:20px;font-weight:700;color:' + color + ';">' + value + "</div>" +
    "</td></tr></table>"
  );
}

function th(text: string, align: string = "left"): string {
  return '<th style="padding:10px 14px;text-align:' + align + ';font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#71717a;background:#fafafa;border-bottom:1px solid #e4e4e7;">' + text + "</th>";
}

function td(content: string, align: string = "left", extra: string = ""): string {
  return '<td style="padding:12px 14px;text-align:' + align + ';font-size:13px;color:#374151;border-bottom:1px solid #f4f4f5;' + extra + '">' + content + "</td>";
}

// ─── Data interfaces ──────────────────────────────────────────────────────────

export interface SaleReceiptEmailData {
  pharmacyId: string; // required for transporter lookup
  customerEmail: string;
  customerName: string;
  pharmacyName: string;
  pharmacyAddress?: string;
  pharmacyPhone?: string;
  invoiceNumber: string;
  items: Array<{ productName: string; batchNumber: string; quantity: number; unitPrice: number; total: number }>;
  totalAmount: number;
  paidAmount: number;
  change: number;
  paymentMethod: string;
  saleDate: Date;
}

export interface LowStockEmailData {
  pharmacyId: string;
  pharmacyEmail: string; // pharmacy's contact email (recipient)
  pharmacyName: string;
  items: Array<{ brandName: string; currentStock: number; reorderLevel: number }>;
}

export interface OutOfStockEmailData {
  pharmacyId: string;
  pharmacyEmail: string;
  pharmacyName: string;
  items: Array<{ brandName: string }>;
}

export interface BatchDisposalEmailData {
  pharmacyId: string;
  pharmacyEmail: string;
  pharmacyName: string;
  batches: Array<{ productName: string; batchNumber: string; disposedQuantity: number; reason: string; disposedBy: string; note?: string }>;
}

export interface DailySalesSummaryEmailData {
  pharmacyId: string;
  pharmacyEmail: string;
  pharmacyName: string;
  date: string;
  totalRevenue: number;
  totalTransactions: number;
  grossProfit: number;
  topProducts: Array<{ name: string; qtySold: number; revenue: number }>;
  paymentBreakdown: Array<{ method: string; amount: number }>;
}

// ─── 1. Customer Sale Receipt ─────────────────────────────────────────────────

export async function sendSaleReceiptEmail(data: SaleReceiptEmailData): Promise<void> {
  console.log(`[EmailService] sendSaleReceiptEmail -> pharmacy:${data.pharmacyId} customer:${data.customerEmail}`);
  if (!data.customerEmail) { console.warn("[EmailService] No customer email :skipping receipt"); return; }

  const { transporter, config } = await getTransporterForPharmacy(data.pharmacyId);

  const itemRows = data.items
    .map((item, i) =>
      '<tr style="background:' + (i % 2 === 0 ? "#ffffff" : "#fafafa") + '">' +
      td('<span style="font-weight:600;color:#18181b;">' + item.productName + "</span><br/>" +
        '<span style="font-size:11px;color:#a1a1aa;">Batch: ' + item.batchNumber + "</span>") +
      td(String(item.quantity), "center", "font-weight:600;color:#18181b;") +
      td(money(item.unitPrice), "right") +
      td('<span style="font-weight:700;color:#18181b;">' + money(item.total) + "</span>", "right") +
      "</tr>"
    )
    .join("");

  const header =
    '<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.5px;">Receipt</h1>' +
    '<p style="margin:0;font-size:14px;color:#71717a;">' + data.pharmacyName +
    (data.pharmacyAddress ? " &nbsp;&middot;&nbsp; " + data.pharmacyAddress : "") +
    (data.pharmacyPhone ? " &nbsp;&middot;&nbsp; " + data.pharmacyPhone : "") + "</p>";

  const body =
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">' +
    "<tr>" +
    metaCell("Invoice", data.invoiceNumber) +
    metaCell("Date", fmtDate(data.saleDate), "center") +
    metaCell("Time", fmtTime(data.saleDate), "right") +
    "</tr></table>" +
    '<p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi <strong>' + (data.customerName || "Customer") + "</strong>, thank you for your purchase. Here is a summary of your order.</p>" +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">' +
    "<thead><tr>" + th("Medicine") + th("Qty", "center") + th("Unit Price", "right") + th("Total", "right") + "</tr></thead>" +
    "<tbody>" + itemRows + "</tbody>" +
    "</table>" +
    divider() +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td style="font-size:13px;color:#71717a;padding:5px 0;">Subtotal</td>' +
    '<td style="font-size:13px;color:#374151;text-align:right;padding:5px 0;">' + money(data.totalAmount) + "</td></tr>" +
    '<tr><td style="font-size:13px;color:#71717a;padding:5px 0;">Payment &nbsp;(' + data.paymentMethod.toUpperCase() + ")</td>" +
    '<td style="font-size:13px;color:#374151;text-align:right;padding:5px 0;">' + money(data.paidAmount) + "</td></tr>" +
    (data.change > 0
      ? '<tr><td style="font-size:13px;color:#71717a;padding:5px 0;">Change</td><td style="font-size:13px;color:#374151;text-align:right;padding:5px 0;">' + money(data.change) + "</td></tr>"
      : "") +
    '<tr><td colspan="2" style="padding:12px 0 0;"><div style="border-top:1px solid #e4e4e7;"></div></td></tr>' +
    '<tr><td style="font-size:15px;font-weight:700;color:#18181b;padding:12px 0 0;">Total</td>' +
    '<td style="font-size:18px;font-weight:700;color:#18181b;text-align:right;padding:12px 0 0;">' + money(data.totalAmount) + "</td></tr></table>";

  const html = wrap("Receipt " + data.invoiceNumber + " :" + data.pharmacyName, "#18181b", header, body);

  const r = await transporter.sendMail({
    from: buildFromAddress(config),
    to: data.customerEmail,
    subject: "Receipt " + data.invoiceNumber + " :" + data.pharmacyName,
    html,
  });
  console.log(`[EmailService] Receipt sent -> ${data.customerEmail} | id:${r.messageId}`);
}

// ─── 2. Low Stock Alert ───────────────────────────────────────────────────────

export async function sendLowStockAlert(data: LowStockEmailData): Promise<void> {
  console.log(`[EmailService] sendLowStockAlert -> pharmacy:${data.pharmacyId} (${data.items.length} items)`);
  if (!data.pharmacyEmail || data.items.length === 0) { console.warn("[EmailService] Low stock skipped"); return; }

  const { transporter, config } = await getTransporterForPharmacy(data.pharmacyId);

  const rows = data.items
    .map((item, i) => {
      const pct = Math.round((item.currentStock / Math.max(1, item.reorderLevel)) * 100);
      const barColor = pct <= 30 ? "#ef4444" : pct <= 60 ? "#f59e0b" : "#71717a";
      const barW = Math.max(3, Math.min(100, pct));
      return (
        '<tr style="background:' + (i % 2 === 0 ? "#ffffff" : "#fafafa") + '">' +
        td('<span style="font-weight:600;color:#18181b;">' + item.brandName + "</span>") +
        td('<span style="font-weight:700;color:#ef4444;font-size:15px;">' + item.currentStock + "</span>", "center") +
        td(String(item.reorderLevel), "center", "color:#71717a;") +
        '<td style="padding:12px 14px;border-bottom:1px solid #f4f4f5;">' +
        '<div style="background:#e4e4e7;border-radius:2px;height:4px;width:100%;min-width:80px;">' +
        '<div style="background:' + barColor + ';border-radius:2px;height:4px;width:' + barW + '%;"></div></div>' +
        '<div style="font-size:10px;color:#a1a1aa;margin-top:4px;">' + pct + "% of reorder level</div>" +
        "</td></tr>"
      );
    })
    .join("");

  const header =
    '<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#f59e0b;">Stock Alert</p>' +
    '<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.5px;">Low Stock Warning</h1>' +
    '<p style="margin:0;font-size:14px;color:#71717a;">' + data.items.length + " item" + (data.items.length > 1 ? "s are" : " is") + " below the reorder threshold.</p>";

  const body =
    '<p style="margin:0 0 24px;font-size:14px;color:#374151;">The following medicines have dropped below their reorder levels at <strong>' + data.pharmacyName + "</strong>. Please restock to avoid disruption.</p>" +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">' +
    "<thead><tr>" + th("Medicine") + th("Current Stock", "center") + th("Reorder Level", "center") + th("Stock Level") + "</tr></thead>" +
    "<tbody>" + rows + "</tbody>" +
    "</table>" +
    divider() +
    '<p style="margin:0;font-size:13px;color:#71717a;border-left:3px solid #f59e0b;padding-left:14px;">Contact your suppliers promptly to ensure stock is replenished before it runs out completely.</p>';

  const html = wrap("Low Stock: " + data.items.length + " item(s) need attention :" + data.pharmacyName, "#f59e0b", header, body);

  const r = await transporter.sendMail({
    from: buildFromAddress(config),
    to: data.pharmacyEmail,
    subject: "Low Stock Warning :" + data.items.length + " medicine" + (data.items.length > 1 ? "s" : "") + " need restocking",
    html,
  });
  console.log(`[EmailService] Low-stock alert sent -> ${data.pharmacyEmail} | id:${r.messageId}`);
}

// ─── 3. Out of Stock Alert ────────────────────────────────────────────────────

export async function sendOutOfStockAlert(data: OutOfStockEmailData): Promise<void> {
  console.log(`[EmailService] sendOutOfStockAlert -> pharmacy:${data.pharmacyId} (${data.items.length} items)`);
  if (!data.pharmacyEmail || data.items.length === 0) { console.warn("[EmailService] Out-of-stock skipped"); return; }

  const { transporter, config } = await getTransporterForPharmacy(data.pharmacyId);

  const rows = data.items
    .map((item, i) =>
      '<tr style="background:' + (i % 2 === 0 ? "#ffffff" : "#fafafa") + '">' +
      td('<span style="font-weight:600;color:#18181b;">' + item.brandName + "</span>") +
      '<td style="padding:12px 14px;text-align:center;border-bottom:1px solid #f4f4f5;">' +
      '<span style="display:inline-block;padding:3px 12px;background:#fef2f2;color:#dc2626;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;border-radius:3px;">Out of Stock</span>' +
      "</td>" +
      td("Reorder immediately", "center", "font-size:12px;color:#a1a1aa;") +
      "</tr>"
    )
    .join("");

  const header =
    '<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#ef4444;">Urgent Alert</p>' +
    '<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.5px;">Out of Stock</h1>' +
    '<p style="margin:0;font-size:14px;color:#71717a;">' + data.items.length + " medicine" + (data.items.length > 1 ? "s are" : " is") + " completely out of stock.</p>";

  const body =
    '<p style="margin:0 0 24px;font-size:14px;color:#374151;">The following medicines at <strong>' + data.pharmacyName + "</strong> have zero stock. Customers cannot be served until these are replenished.</p>" +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #fecaca;border-radius:6px;overflow:hidden;">' +
    "<thead><tr>" + th("Medicine") + th("Status", "center") + th("Action Required", "center") + "</tr></thead>" +
    "<tbody>" + rows + "</tbody>" +
    "</table>" +
    divider() +
    '<p style="margin:0;font-size:13px;color:#71717a;border-left:3px solid #ef4444;padding-left:14px;">Contact your suppliers immediately. Out-of-stock medicines directly impact patient care and revenue.</p>';

  const html = wrap("Out of Stock: " + data.items.length + " medicine(s) :" + data.pharmacyName, "#ef4444", header, body);

  const r = await transporter.sendMail({
    from: buildFromAddress(config),
    to: data.pharmacyEmail,
    subject: "Out of Stock :" + data.items.length + " medicine" + (data.items.length > 1 ? "s require" : " requires") + " immediate reorder",
    html,
  });
  console.log(`[EmailService] Out-of-stock alert sent -> ${data.pharmacyEmail} | id:${r.messageId}`);
}

// ─── 4. Batch Disposal Alert ──────────────────────────────────────────────────

export async function sendBatchDisposalAlert(data: BatchDisposalEmailData): Promise<void> {
  console.log(`[EmailService] sendBatchDisposalAlert -> pharmacy:${data.pharmacyId}`);
  if (!data.pharmacyEmail || data.batches.length === 0) { console.warn("[EmailService] Disposal skipped"); return; }

  const { transporter, config } = await getTransporterForPharmacy(data.pharmacyId);

  const reasonStyle: Record<string, string> = {
    EXPIRED:  "background:#fef2f2;color:#dc2626;",
    DAMAGED:  "background:#fffbeb;color:#d97706;",
    RECALLED: "background:#f5f3ff;color:#7c3aed;",
    OTHER:    "background:#f4f4f5;color:#52525b;",
  };

  const totalDisposed = data.batches.reduce((s, b) => s + b.disposedQuantity, 0);

  const rows = data.batches
    .map((b, i) => {
      const rs = reasonStyle[b.reason] ?? reasonStyle.OTHER;
      return (
        '<tr style="background:' + (i % 2 === 0 ? "#ffffff" : "#fafafa") + '">' +
        td('<span style="font-weight:600;color:#18181b;">' + b.productName + "</span>") +
        td('<span style="font-family:\'Courier New\',monospace;font-size:12px;">' + b.batchNumber + "</span>") +
        td('<span style="font-weight:700;">' + b.disposedQuantity + "</span>", "center") +
        '<td style="padding:12px 14px;border-bottom:1px solid #f4f4f5;">' +
        '<span style="display:inline-block;padding:2px 10px;' + rs + 'font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;border-radius:3px;">' + b.reason + "</span></td>" +
        td(b.disposedBy) +
        td(b.note || "&#8212;", "left", "color:#a1a1aa;font-size:12px;") +
        "</tr>"
      );
    })
    .join("");

  const header =
    '<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#71717a;">Inventory Update</p>' +
    '<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.5px;">Batch Disposal Report</h1>' +
    '<p style="margin:0;font-size:14px;color:#71717a;">' + data.batches.length + " batch" + (data.batches.length > 1 ? "es have" : " has") + " been disposed :" + totalDisposed + " total units.</p>";

  const body =
    '<p style="margin:0 0 24px;font-size:14px;color:#374151;">The following batch' + (data.batches.length > 1 ? "es have" : " has") + " been disposed at <strong>" + data.pharmacyName + "</strong>. Please retain this report for your records.</p>" +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">' +
    "<tr>" +
    '<td style="width:50%;padding-right:8px;">' + statBox("Batches Disposed", String(data.batches.length)) + "</td>" +
    '<td style="width:50%;padding-left:8px;">' + statBox("Units Removed", String(totalDisposed), "#dc2626") + "</td>" +
    "</tr></table>" +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">' +
    "<thead><tr>" + th("Medicine") + th("Batch No.") + th("Qty", "center") + th("Reason") + th("Disposed By") + th("Note") + "</tr></thead>" +
    "<tbody>" + rows + "</tbody>" +
    "</table>" +
    divider() +
    '<p style="margin:0;font-size:13px;color:#71717a;border-left:3px solid #e4e4e7;padding-left:14px;">Please update your physical stock records and inform relevant suppliers if the disposal was due to a recall or supplier fault.</p>';

  const html = wrap("Batch Disposal Report :" + data.batches.length + " batch(es) :" + data.pharmacyName, "#18181b", header, body);

  const r = await transporter.sendMail({
    from: buildFromAddress(config),
    to: data.pharmacyEmail,
    subject: "Batch Disposal Report :" + data.batches.length + " batch" + (data.batches.length > 1 ? "es" : "") + " (" + totalDisposed + " units)",
    html,
  });
  console.log(`[EmailService] Disposal alert sent -> ${data.pharmacyEmail} | id:${r.messageId}`);
}

// ─── 5. Daily Sales Summary ───────────────────────────────────────────────────

export async function sendDailySalesSummaryEmail(data: DailySalesSummaryEmailData): Promise<void> {
  console.log(`[EmailService] sendDailySalesSummaryEmail -> pharmacy:${data.pharmacyId}`);
  if (!data.pharmacyEmail) { console.warn("[EmailService] Daily summary skipped :no pharmacy email"); return; }

  const { transporter, config } = await getTransporterForPharmacy(data.pharmacyId);

  const margin = data.totalRevenue > 0 ? Math.round((data.grossProfit / data.totalRevenue) * 100) : 0;

  const topRows = data.topProducts
    .slice(0, 5)
    .map((p, i) =>
      '<tr style="background:' + (i % 2 === 0 ? "#ffffff" : "#fafafa") + '">' +
      '<td style="padding:12px 14px;text-align:center;font-size:13px;font-weight:700;color:#a1a1aa;border-bottom:1px solid #f4f4f5;width:32px;">' + (i + 1) + "</td>" +
      td('<span style="font-weight:600;color:#18181b;">' + p.name + "</span>") +
      td(p.qtySold + " units", "center", "color:#71717a;") +
      td('<span style="font-weight:700;">' + money(p.revenue) + "</span>", "right") +
      "</tr>"
    )
    .join("");

  const payRows = data.paymentBreakdown
    .map((p) => {
      const pct = data.totalRevenue > 0 ? Math.round((p.amount / data.totalRevenue) * 100) : 0;
      return (
        "<tr>" +
        td(p.method.toUpperCase(), "left", "font-weight:600;") +
        '<td style="padding:12px 14px;border-bottom:1px solid #f4f4f5;">' +
        '<div style="background:#e4e4e7;border-radius:2px;height:4px;">' +
        '<div style="background:#18181b;border-radius:2px;height:4px;width:' + Math.max(2, pct) + '%;"></div></div></td>' +
        td(money(p.amount), "right", "font-weight:700;") +
        td(pct + "%", "right", "color:#a1a1aa;") +
        "</tr>"
      );
    })
    .join("");

  const header =
    '<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#71717a;">End of Day</p>' +
    '<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.5px;">Daily Sales Summary</h1>' +
    '<p style="margin:0;font-size:14px;color:#71717a;">' + data.date + " &nbsp;&middot;&nbsp; " + data.pharmacyName + "</p>";

  const body =
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">' +
    "<tr>" +
    '<td style="width:33%;padding-right:6px;">' + statBox("Total Revenue", money(data.totalRevenue), "#059669") + "</td>" +
    '<td style="width:33%;padding:0 3px;">' + statBox("Transactions", String(data.totalTransactions)) + "</td>" +
    '<td style="width:33%;padding-left:6px;">' + statBox("Gross Profit", money(data.grossProfit)) + "</td>" +
    "</tr></table>" +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:6px;margin-bottom:28px;">' +
    '<tr><td style="padding:16px 18px;">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:8px;">' +
    '<span style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a1a1aa;">Profit Margin</span>' +
    '<span style="font-size:13px;font-weight:700;color:#18181b;">' + margin + "%</span></div>" +
    '<div style="background:#e4e4e7;border-radius:2px;height:4px;">' +
    '<div style="background:#18181b;border-radius:2px;height:4px;width:' + Math.max(2, margin) + '%;"></div></div>' +
    "</td></tr></table>" +
    (data.topProducts.length > 0
      ? '<p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a1a1aa;">Top Selling Medicines</p>' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;margin-bottom:28px;">' +
        "<thead><tr>" + th("#", "center") + th("Medicine") + th("Units Sold", "center") + th("Revenue", "right") + "</tr></thead>" +
        "<tbody>" + topRows + "</tbody>" +
        "</table>"
      : "") +
    (data.paymentBreakdown.length > 0
      ? '<p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a1a1aa;">Payment Breakdown</p>' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">' +
        "<thead><tr>" + th("Method") + th("Share") + th("Amount", "right") + th("%", "right") + "</tr></thead>" +
        "<tbody>" + payRows + "</tbody>" +
        "</table>"
      : "") +
    divider() +
    '<p style="margin:0;font-size:13px;color:#a1a1aa;text-align:center;">Automatically generated at 8:00 PM Nepal Time. Log in to MediSync for full analytics.</p>';

  const html = wrap("Daily Sales Summary :" + data.date + " :" + data.pharmacyName, "#18181b", header, body);

  const r = await transporter.sendMail({
    from: buildFromAddress(config),
    to: data.pharmacyEmail,
    subject: "Daily Summary :" + data.date + " :" + money(data.totalRevenue) + " revenue, " + data.totalTransactions + " sales",
    html,
  });
  console.log(`[EmailService] Daily summary sent -> ${data.pharmacyEmail} | id:${r.messageId}`);
}

// ─── 6. Expiry Alert ──────────────────────────────────────────────────────────

export interface ExpiryAlertEmailData {
  pharmacyId: string;
  pharmacyEmail: string;
  pharmacyName: string;
  items: Array<{
    brandName: string;
    batchNumber: string;
    expiryDate: Date;
    daysUntilExpiry: number;
    currentQuantity: number;
  }>;
}

export async function sendExpiryAlertEmail(data: ExpiryAlertEmailData): Promise<void> {
  console.log(`[EmailService] sendExpiryAlertEmail -> pharmacy:${data.pharmacyId} (${data.items.length} batches)`);
  if (!data.pharmacyEmail || data.items.length === 0) { console.warn("[EmailService] Expiry alert skipped"); return; }

  const { transporter, config } = await getTransporterForPharmacy(data.pharmacyId);

  const urgencyColor = (days: number) => days <= 7 ? "#ef4444" : days <= 30 ? "#f59e0b" : "#6366f1";
  const urgencyLabel = (days: number) => days <= 7 ? "CRITICAL" : days <= 30 ? "EXPIRING SOON" : "EXPIRING";

  const rows = data.items
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
    .map((item, i) => {
      const color = urgencyColor(item.daysUntilExpiry);
      const label = urgencyLabel(item.daysUntilExpiry);
      return (
        '<tr style="background:' + (i % 2 === 0 ? "#ffffff" : "#fafafa") + '">' +
        td('<span style="font-weight:600;color:#18181b;">' + item.brandName + "</span>") +
        td('<span style="font-family:\'Courier New\',monospace;font-size:12px;">' + item.batchNumber + "</span>") +
        td(fmtDate(item.expiryDate), "center") +
        '<td style="padding:12px 14px;text-align:center;border-bottom:1px solid #f4f4f5;">' +
        '<span style="display:inline-block;padding:2px 10px;background:' + color + '18;color:' + color + ';font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;border-radius:3px;">' +
        (item.daysUntilExpiry <= 0 ? "EXPIRED" : item.daysUntilExpiry + " days") + "</span></td>" +
        '<td style="padding:12px 14px;text-align:center;border-bottom:1px solid #f4f4f5;">' +
        '<span style="display:inline-block;padding:2px 10px;background:' + color + '18;color:' + color + ';font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;border-radius:3px;">' + label + "</span></td>" +
        td(String(item.currentQuantity) + " units", "center", "font-weight:600;") +
        "</tr>"
      );
    })
    .join("");

  const critical = data.items.filter(i => i.daysUntilExpiry <= 7).length;
  const soon     = data.items.filter(i => i.daysUntilExpiry > 7 && i.daysUntilExpiry <= 30).length;

  const header =
    '<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#ef4444;">Expiry Alert</p>' +
    '<h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.5px;">Medicines Expiring Soon</h1>' +
    '<p style="margin:0;font-size:14px;color:#71717a;">' + data.items.length + " batch" + (data.items.length > 1 ? "es require" : " requires") + " your attention at " + data.pharmacyName + ".</p>";

  const body =
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">' +
    "<tr>" +
    '<td style="width:50%;padding-right:8px;">' + statBox("Critical (≤7 days)", String(critical), "#ef4444") + "</td>" +
    '<td style="width:50%;padding-left:8px;">' + statBox("Expiring (≤30 days)", String(soon), "#f59e0b") + "</td>" +
    "</tr></table>" +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #fecaca;border-radius:6px;overflow:hidden;">' +
    "<thead><tr>" + th("Medicine") + th("Batch No.") + th("Expiry Date", "center") + th("Time Left", "center") + th("Urgency", "center") + th("Stock", "center") + "</tr></thead>" +
    "<tbody>" + rows + "</tbody>" +
    "</table>" +
    divider() +
    '<p style="margin:0;font-size:13px;color:#71717a;border-left:3px solid #ef4444;padding-left:14px;">Review expired or soon-to-expire stock and arrange disposal or return to supplier. Dispensing expired medicines is a compliance risk.</p>';

  const html = wrap("Expiry Alert :" + data.items.length + " batch(es) :" + data.pharmacyName, "#ef4444", header, body);

  const r = await transporter.sendMail({
    from: buildFromAddress(config),
    to: data.pharmacyEmail,
    subject: "Expiry Alert :" + data.items.length + " batch" + (data.items.length > 1 ? "es" : "") + " expiring at " + data.pharmacyName,
    html,
  });
  console.log(`[EmailService] Expiry alert sent -> ${data.pharmacyEmail} | id:${r.messageId}`);
}

// ─── Legacy shim :kept so app.ts doesn't break ───────────────────────────────
/**
 * @deprecated The new system requires pharmacyId on each call.
 * This shim no longer attempts a global SMTP connection.
 * Call verifySmtpForPharmacy(pharmacyId) from emailTransporter.service.ts instead.
 */
export async function verifyEmailConnection(): Promise<void> {
  console.log("[EmailService] verifyEmailConnection() is deprecated in the multi-tenant system.");
  console.log("[EmailService] Email connections are verified per-pharmacy via /api/setting/email/test");
}