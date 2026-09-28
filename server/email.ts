const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Capivara Política <onboarding@resend.dev>';

export async function enviarEmail(destinatario: string, assunto: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY não configurada — email para ${destinatario} não foi enviado ("${assunto}")`);
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: destinatario, subject: assunto, html }),
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => '');
    throw new Error(`Falha ao enviar email (${r.status}): ${corpo}`);
  }
}

export function emailRecuperacaoHtml(link: string): string {
  return `
    <p>Você pediu para redefinir sua senha no Capivara Política.</p>
    <p><a href="${link}">Clique aqui para criar uma nova senha</a>. O link expira em 1 hora.</p>
    <p>Se não foi você quem pediu, pode ignorar este email.</p>
  `;
}
