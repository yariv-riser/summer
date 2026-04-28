import { getValidAccessToken } from './google-auth.js';
import { listMessages, getMessage, extractBody, sendMessage } from './gmail.js';
import { extractMany } from './extract.js';
import { convertReceipts } from './fx.js';
import { renderEmail } from './email-template.js';

export async function runPipeline({ userId, userEmail, from, to }) {
  const accessToken = await getValidAccessToken(userId);

  const afterUnix = Math.floor(new Date(from).getTime() / 1000);
  const beforeUnix = Math.floor(new Date(to).getTime() / 1000) + 86400;

  // {a b c} is Gmail's OR operator. We cast a wide net here and let
  // schema.org / the LLM filter via is_receipt downstream — the previous
  // category:purchases-only filter missed SaaS invoices, Hebrew vendors,
  // and anything Gmail's classifier didn't recognize.
  const subjectTerms = [
    'receipt', 'invoice', 'order', 'payment', 'purchase',
    'קבלה', 'חשבונית', 'הזמנה',
    'factura', 'fattura', 'fatura', 'rechnung',
  ];
  const q =
    `{category:purchases subject:(${subjectTerms.join(' OR ')})} ` +
    `after:${afterUnix} before:${beforeUnix}`;
  const ids = await listMessages(accessToken, { q, maxResults: 200 });

  const emails = [];
  for (const id of ids) {
    const msg = await getMessage(accessToken, id);
    emails.push(extractBody(msg));
  }

  const extracted = await extractMany(emails);
  const receipts = extracted.filter((r) => r.is_receipt);
  const converted = await convertReceipts(receipts);

  const html = renderEmail({ from, to, receipts: converted });
  const subject = `סיכום קבלות / Summary of receipts — ${from} to ${to}`;

  await sendMessage(accessToken, {
    from: userEmail,
    to: userEmail,
    subject,
    html,
  });

  return { sent: true, count: converted.length };
}
