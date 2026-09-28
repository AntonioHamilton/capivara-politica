import fs from 'node:fs';
import path from 'node:path';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Capivara Política <onboarding@resend.dev>';

const capivaraBase64 = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'public', 'capivara.png')).toString('base64');

interface Anexo {
  filename: string;
  content: string;
  content_id?: string;
}

export async function enviarEmail(destinatario: string, assunto: string, html: string, anexos: Anexo[] = []): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY não configurada — email para ${destinatario} não foi enviado ("${assunto}")`);
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: destinatario, subject: assunto, html, attachments: anexos }),
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => '');
    throw new Error(`Falha ao enviar email (${r.status}): ${corpo}`);
  }
}

function layoutEmail(eyebrow: string, titulo: string, corpoHtml: string): string {
  return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin: 0; padding: 0; background-color: #0c0c0d; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0c0c0d; padding: 40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #161618; border: 1px solid #2c2c30; border-radius: 20px; overflow: hidden;">
            <tr>
              <td style="background-color: #1f1f22; padding: 36px 32px 8px; text-align: center;">
                <img src="cid:capivara" width="120" height="120" alt="Capivara Política" style="display: block; margin: 0 auto 12px; border-radius: 50%; border: 3px solid #ffc800;" />
                <h2 style="margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #ffc800;">Capivara Política</h2>
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 32px 36px; text-align: center;">
                <h1 style="margin: 0 0 16px; font-size: 24px; line-height: 1.3; color: #f4f4f0;">${titulo}</h1>
                <div style="font-size: 15px; line-height: 1.6; color: #b8b8b3; text-align: left;">
                  ${corpoHtml}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding: 18px 32px; background-color: #1f1f22; border-top: 1px solid #2c2c30; text-align: center;">
                <span style="font-size: 12px; color: #9b9b94;">${eyebrow}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}

function botaoEmail(texto: string, link: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px auto; width: 100%;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="border-radius: 999px; background-color: #ffc800; box-shadow: 0 8px 20px rgba(255, 200, 0, 0.25);">
                <a href="${link}" style="display: inline-block; padding: 14px 36px; font-size: 16px; font-weight: 700; color: #111111; text-decoration: none;">${texto}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

export function emailRecuperacaoHtml(link: string): string {
  return layoutEmail(
    'Eleições 2026 · Brasil',
    'Redefinir sua senha',
    `
    <p style="margin: 0 0 8px;">Você pediu para redefinir sua senha no Capivara Política.</p>
    <p style="margin: 0;">Clique no botão abaixo para criar uma nova senha. O link expira em <strong style="color: #f4f4f0;">1 hora</strong>.</p>
    ${botaoEmail('Criar nova senha', link)}
    <p style="margin: 0; font-size: 13px; color: #7a7a75;">Se não foi você quem pediu, pode ignorar este email — sua senha continua a mesma.</p>
    `,
  );
}

export function emailAnexoCapivara(): Anexo {
  return { filename: 'capivara.png', content: capivaraBase64, content_id: 'capivara' };
}
