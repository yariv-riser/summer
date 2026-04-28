// End-to-end dry run: Gmail → extract → fx → email template.
// Writes HTML to /tmp/summer-preview.html. No email is sent.
//
//   GEMINI_API_KEY=... bun scripts/preview-summary.js <userId> [days]
import fs from 'node:fs';
import { getValidAccessToken } from '../lib/google-auth.js';
import { listMessages, getMessage, extractBody } from '../lib/gmail.js';
import { extractMany } from '../lib/extract.js';
import { convertReceipts } from '../lib/fx.js';
import { renderEmail } from '../lib/email-template.js';

const userId = process.argv[2];
const days = Number(process.argv[3] || 30);
if (!userId) {
  console.error('Usage: GEMINI_API_KEY=... bun scripts/preview-summary.js <userId> [days]');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('Set GEMINI_API_KEY first.');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const after = now - days * 86400;
const fromIso = new Date(after * 1000).toISOString().slice(0, 10);
const toIso = new Date(now * 1000).toISOString().slice(0, 10);

console.log(`window: ${fromIso} → ${toIso}`);

const accessToken = await getValidAccessToken(userId);
const subjectTerms = [
  'receipt', 'invoice', 'order', 'payment', 'purchase',
  'קבלה', 'חשבונית', 'הזמנה',
  'factura', 'fattura', 'fatura', 'rechnung',
];
const q =
  `{category:purchases subject:(${subjectTerms.join(' OR ')})} ` +
  `after:${after} before:${now}`;
const ids = await listMessages(accessToken, { q, maxResults: 50 });
console.log(`gmail: ${ids.length} candidates`);

const emails = [];
for (const id of ids) {
  const msg = await getMessage(accessToken, id);
  emails.push(extractBody(msg));
}

console.log(`extracting ${emails.length} messages (schema.org pre-pass + Gemini fallback)…`);
const extracted = await extractMany(emails);
const receipts = extracted.filter((r) => r.is_receipt);
console.log(`extract: ${receipts.length} receipts (${extracted.length - receipts.length} non-receipts)`);

const converted = await convertReceipts(receipts);
console.log(`fx: converted ${converted.filter((r) => !r.fx_unconverted).length}/${converted.length}`);

const html = renderEmail({ from: fromIso, to: toIso, receipts: converted });
const out = '/tmp/summer-preview.html';
fs.writeFileSync(out, html);
console.log(`\n✓ wrote ${out} — open it in a browser`);
