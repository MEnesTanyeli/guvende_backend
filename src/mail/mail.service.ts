import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  constructor(private readonly configService: ConfigService) {}

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    if (!apiKey) {
      throw new Error('BREVO_API_KEY tanimli degil.');
    }

    const safeName = this.escapeHtml(name || 'Kullanici');
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      signal: AbortSignal.timeout(10_000),
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: 'G\u00fcvende',
          email: 'noreply@mail.guvende.app',
        },
        to: [{ email: to, name }],
        subject: "G\u00fcvende'ye Ho\u015f Geldiniz",
        htmlContent: `
          <!doctype html>
          <html lang="tr">
            <body style="margin:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#17352b">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
                <tr><td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:36px;box-shadow:0 8px 28px rgba(0,0,0,.08)">
                    <tr><td>
                      <div style="font-size:25px;font-weight:700;color:#1d7a55;margin-bottom:24px">G&uuml;vende</div>
                      <h1 style="font-size:24px;margin:0 0 16px">Ho&#351; geldiniz, ${safeName}!</h1>
                      <p style="font-size:16px;line-height:1.6;margin:0 0 16px">Hesab&#305;n&#305;z ba&#351;ar&#305;yla olu&#351;turuldu.</p>
                      <p style="font-size:16px;line-height:1.6;margin:0">Sevdiklerinizle daha g&uuml;vende ve ba&#287;lant&#305;da kalman&#305;za yard&#305;mc&#305; olmak i&ccedil;in buraday&#305;z.</p>
                      <hr style="border:0;border-top:1px solid #e5ece8;margin:28px 0">
                      <p style="font-size:13px;color:#6c7d76;margin:0">Bu e-posta G&uuml;vende uygulamas&#305;na kay&#305;t oldu&#287;unuz i&ccedil;in g&ouml;nderildi.</p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
          </html>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Brevo e-posta gonderimi basarisiz (${response.status}): ${body}`,
      );
    }
  }

  async sendVerificationCodeEmail(to: string, code: string): Promise<void> {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    if (!apiKey) {
      throw new Error('BREVO_API_KEY tanimli degil.');
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      signal: AbortSignal.timeout(10_000),
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: 'G\u00fcvende',
          email: 'noreply@mail.guvende.app',
        },
        to: [{ email: to }],
        subject: 'G\u00fcvende E-posta Do\u011frulama Kodu',
        htmlContent: `
          <!doctype html>
          <html lang="tr">
            <body style="margin:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#17352b">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
                <tr><td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:36px;box-shadow:0 8px 28px rgba(0,0,0,.08)">
                    <tr><td>
                      <div style="font-size:25px;font-weight:700;color:#1d7a55;margin-bottom:24px">G&uuml;vende</div>
                      <h1 style="font-size:22px;margin:0 0 16px">E-posta Adresinizi Do&#287;rulay&#305;n</h1>
                      <p style="font-size:16px;line-height:1.6;margin:0 0 24px">G&uuml;vende uygulamas&#305;na kay&#305;t olmak i&ccedil;in kullanaca&#287;&#305;n&#305;z do&#287;rulama kodunuz a&#351;a&#287;&#305;dad&#305;r:</p>
                      <div style="background:#f0f7f4;border-radius:12px;padding:16px 24px;font-size:32px;font-weight:800;letter-spacing:6px;color:#1d7a55;text-align:center;margin-bottom:24px">${code}</div>
                      <p style="font-size:14px;color:#6c7d76;margin:0">E&#287;er bu talebi siz yapmad&#305;ysan&#305;z, bu e-postay&#305; dikkate almayebilirsiniz.</p>
                      <hr style="border:0;border-top:1px solid #e5ece8;margin:28px 0">
                      <p style="font-size:13px;color:#6c7d76;margin:0">Bu e-posta G&uuml;vende uygulamas&#305;na kay&#305;t talebinde bulunuldu&#287;u i&ccedil;in otomatik g&ouml;nderilmi&#351;tir.</p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
          </html>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Brevo e-posta gonderimi basarisiz (${response.status}): ${body}`,
      );
    }
  }

  async sendResetPasswordEmail(to: string, code: string): Promise<void> {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    if (!apiKey) {
      throw new Error('BREVO_API_KEY tanimli degil.');
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      signal: AbortSignal.timeout(10_000),
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: 'G\u00fcvende',
          email: 'noreply@mail.guvende.app',
        },
        to: [{ email: to }],
        subject: 'G\u00fcvende \u015eifre S\u0131f\u0131rlama Kodu',
        htmlContent: `
          <!doctype html>
          <html lang="tr">
            <body style="margin:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#17352b">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
                <tr><td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:36px;box-shadow:0 8px 28px rgba(0,0,0,.08)">
                    <tr><td>
                      <div style="font-size:25px;font-weight:700;color:#1d7a55;margin-bottom:24px">G&uuml;vende</div>
                      <h1 style="font-size:22px;margin:0 0 16px">&#351;ifre S&#305;f&#305;rlama Talebi</h1>
                      <p style="font-size:16px;line-height:1.6;margin:0 0 24px">G&uuml;vende hesab&#305;n&#305;z&#305;n &#351;ifresini s&#305;f&#305;rlamak i&ccedil;in kullanaca&#287;&#305;n&#305;z ge&ccedil;ici do&#287;rulama kodunuz a&#351;a&#287;&#305;dad&#305;r:</p>
                      <div style="background:#f0f7f4;border-radius:12px;padding:16px 24px;font-size:32px;font-weight:800;letter-spacing:6px;color:#1d7a55;text-align:center;margin-bottom:24px">${code}</div>
                      <p style="font-size:14px;color:#6c7d76;margin:0">E&#287;er bu talebi siz yapmad&#305;ysan&#305;z, hesab&#305;n&#305;z g&uuml;vendedir. Bu e-postay&#305; dikkate almayabilirsiniz.</p>
                      <hr style="border:0;border-top:1px solid #e5ece8;margin:28px 0">
                      <p style="font-size:13px;color:#6c7d76;margin:0">Bu e-posta G&uuml;vende uygulamas&#305;na &#351;ifre s&#305;firlama talebinde bulunuldu&#287;u i&ccedil;in otomatik g&ouml;nderilmi&#351;tir.</p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
          </html>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Brevo e-posta gonderimi basarisiz (${response.status}): ${body}`,
      );
    }
  }

  async sendChildElderLogoutCodeEmail(
    to: string,
    memberName: string,
    code: string,
  ): Promise<void> {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    if (!apiKey) {
      throw new Error('BREVO_API_KEY tanimli degil.');
    }

    const safeMemberName = this.escapeHtml(memberName || 'Aile uyesi');
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      signal: AbortSignal.timeout(10_000),
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: 'G\u00fcvende',
          email: 'noreply@mail.guvende.app',
        },
        to: [{ email: to }],
        subject: 'G\u00fcvende \u00c7\u0131k\u0131\u015f Do\u011frulama Kodu',
        htmlContent: `
          <!doctype html>
          <html lang="tr">
            <body style="margin:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#17352b">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
                <tr><td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:36px;box-shadow:0 8px 28px rgba(0,0,0,.08)">
                    <tr><td>
                      <div style="font-size:25px;font-weight:700;color:#1d7a55;margin-bottom:24px">G&uuml;vende</div>
                      <h1 style="font-size:22px;margin:0 0 16px">&Ccedil;&#305;k&#305;&#351; Do&#287;rulama Kodu</h1>
                      <p style="font-size:16px;line-height:1.6;margin:0 0 24px"><strong>${safeMemberName}</strong> cihaz&#305;ndaki G&uuml;vende hesab&#305;ndan &ccedil;&#305;k&#305;&#351; yapmak istiyor.</p>
                      <div style="background:#f0f7f4;border-radius:12px;padding:16px 24px;font-size:32px;font-weight:800;letter-spacing:6px;color:#1d7a55;text-align:center;margin-bottom:24px">${code}</div>
                      <p style="font-size:14px;color:#6c7d76;margin:0">Bu i&#351;lemi siz ba&#351;latmad&#305;ysan&#305;z kodu payla&#351;may&#305;n.</p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
          </html>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Brevo cikis dogrulama e-postasi basarisiz (${response.status}): ${body}`,
      );
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      };
      return entities[character];
    });
  }
}
