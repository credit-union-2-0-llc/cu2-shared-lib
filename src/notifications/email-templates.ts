/**
 * HTML email template builder utilities.
 *
 * Provides consistent, inline-styled email building blocks for transactional
 * emails. Works with any email provider (SendGrid, Resend, SMTP).
 *
 * Extracted from: scienceworks-platform/apps/api/src/calendar/calendar-notification.processor.ts
 *
 * Usage:
 *   import {
 *     emailWrapper, detailTable, detailRow, button, heading,
 *   } from '@cu2/shared-lib/notifications/email-templates';
 *
 *   const html = emailWrapper({
 *     title: 'Booking Confirmed',
 *     brandColor: '#2563eb',
 *     body: `
 *       ${heading('Your booking is confirmed!')}
 *       ${detailTable([
 *         detailRow('Date', 'March 15, 2026'),
 *         detailRow('Time', '10:00 AM - 11:00 AM'),
 *         detailRow('Location', 'Main Hall'),
 *         detailRow('Confirmation', 'ABC-1234'),
 *       ])}
 *       ${button('View Booking', 'https://app.example.com/bookings/123')}
 *     `,
 *     footer: '© 2026 ScienceWorks Museum',
 *   });
 */

// ---------- Types ----------

export interface EmailWrapperOptions {
  /** Email title (shown in preview and at top of body). */
  title: string;
  /** Brand color for header and accents. Default: '#2563eb' */
  brandColor?: string;
  /** HTML body content. */
  body: string;
  /** Optional footer text. */
  footer?: string;
  /** Background color. Default: '#f5f5f5' */
  backgroundColor?: string;
}

// ---------- Building Blocks ----------

/** Single key-value row for a detail table. Returns a <tr> string. */
export function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;width:35%;">${label}</td>
    <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;">${value}</td>
  </tr>`;
}

/** Wrap detail rows in a styled table. Pass an array of detailRow() strings. */
export function detailTable(rows: string[]): string {
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

/** Styled heading (h2 level). */
export function heading(text: string, color = '#111827'): string {
  return `<h2 style="margin:0 0 12px;font-size:20px;color:${color};">${text}</h2>`;
}

/** Styled paragraph. */
export function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">${text}</p>`;
}

/** CTA button. */
export function button(label: string, href: string, color = '#2563eb'): string {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${href}" style="display:inline-block;padding:12px 28px;background:${color};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">${label}</a>
  </div>`;
}

/** Divider line. */
export function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">`;
}

// ---------- Wrapper ----------

/**
 * Full email wrapper with header, body, and optional footer.
 * Returns a complete HTML string ready to send.
 */
export function emailWrapper(options: EmailWrapperOptions): string {
  const brandColor = options.brandColor ?? '#2563eb';
  const bgColor = options.backgroundColor ?? '#f5f5f5';
  const footer = options.footer
    ? `<div style="text-align:center;padding:16px;font-size:12px;color:#9ca3af;">${options.footer}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${options.title}</title></head>
<body style="margin:0;padding:0;background:${bgColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:${brandColor};padding:20px 24px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;color:#ffffff;font-size:22px;">${options.title}</h1>
    </div>
    <div style="background:#ffffff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none;">
      ${options.body}
    </div>
    ${footer}
  </div>
</body>
</html>`;
}
