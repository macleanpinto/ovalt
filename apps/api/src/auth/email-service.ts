import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

/**
 * Minimal email service backed by Amazon SES v2.
 *
 * Design notes:
 * - If `fromAddress` is blank, `send()` silently no-ops. That lets local dev
 *   and LocalStack environments skip email without plumbing feature flags
 *   through the callers.
 * - All send errors are caught and logged, never thrown. Email is best-effort
 *   for invites (the DB record + copy-link are the source of truth).
 */
export type EmailServiceConfig = {
  /** e.g. "invites@ovalt.org". Blank disables sending. */
  fromAddress: string;
  /** AWS region where the SES identity is verified. */
  region: string;
  /** Optional endpoint override for local testing (LocalStack). */
  endpoint?: string;
};

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type SendEmailResult = {
  sent: boolean;
  skipped?: boolean;
  error?: string;
};

export class EmailService {
  private client?: SESv2Client;

  constructor(private config: EmailServiceConfig) {
    if (config.fromAddress) {
      this.client = new SESv2Client({
        region: config.region,
        endpoint: config.endpoint,
      });
    }
  }

  isEnabled(): boolean {
    return !!this.client && !!this.config.fromAddress;
  }

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    if (!this.isEnabled() || !this.client) {
      return { sent: false, skipped: true };
    }

    try {
      await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.config.fromAddress,
          Destination: { ToAddresses: [params.to] },
          ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
          Content: {
            Simple: {
              Subject: { Data: params.subject, Charset: "UTF-8" },
              Body: {
                Html: { Data: params.html, Charset: "UTF-8" },
                Text: { Data: params.text, Charset: "UTF-8" },
              },
            },
          },
        })
      );
      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { sent: false, error: message };
    }
  }

  /** Render the invite email content. Kept inline because it's one template. */
  renderInviteEmail(params: {
    inviterName?: string;
    organizationName: string;
    role: string;
    acceptUrl: string;
    expiresAt: string;
  }) {
    const whoInvited = params.inviterName ? `${params.inviterName} invited you` : "You've been invited";
    const expiryHuman = new Date(params.expiresAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const subject = `${whoInvited} to ${params.organizationName} on Ovalt`;

    const text = [
      `${whoInvited} to join ${params.organizationName} on Ovalt as a ${params.role}.`,
      ``,
      `Accept the invite:`,
      params.acceptUrl,
      ``,
      `This link expires on ${expiryHuman}.`,
      ``,
      `If you weren't expecting this, you can safely ignore this email.`,
      `— Ovalt`,
    ].join("\n");

    // Inline styles so email clients render reliably. No external CSS.
    const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f1f1f;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;">
            <tr>
              <td>
                <h1 style="margin:0 0 16px 0;font-size:24px;color:#003822;">You've been invited to ${escapeHtml(params.organizationName)}</h1>
                <p style="margin:0 0 24px 0;font-size:16px;line-height:1.5;color:#3d3d3d;">
                  ${escapeHtml(whoInvited)} to join <strong>${escapeHtml(params.organizationName)}</strong>
                  on <strong>Ovalt</strong> as a <strong>${escapeHtml(params.role)}</strong>.
                </p>
                <p style="margin:0 0 32px 0;">
                  <a href="${params.acceptUrl}"
                     style="display:inline-block;background:#003822;color:#41ffaf;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:999px;">
                    Accept invite
                  </a>
                </p>
                <p style="margin:0 0 8px 0;font-size:13px;color:#5f5f5f;">
                  Or copy this link into your browser:
                </p>
                <p style="margin:0 0 32px 0;font-size:12px;color:#3d3d3d;word-break:break-all;">
                  <a href="${params.acceptUrl}" style="color:#003822;">${params.acceptUrl}</a>
                </p>
                <p style="margin:0;font-size:12px;color:#8a8a8a;">
                  This invite expires on ${escapeHtml(expiryHuman)}. If you weren't expecting it, ignore this email.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0 0;font-size:11px;color:#8a8a8a;">Sent by Ovalt — ovalt.org</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    return { subject, html, text };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
