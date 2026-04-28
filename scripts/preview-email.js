// Render the summary email with mock receipts and open in browser:
//   bun scripts/preview-email.js && open /tmp/summer-preview.html
import fs from 'node:fs';
import { renderEmail } from '../lib/email-template.js';

const receipts = [
  { date: '2026-04-03', merchant: 'Aroma Espresso', category: 'Food & Drink', amount: 28, currency: 'ILS', amount_ils: 28 },
  { date: '2026-04-05', merchant: 'Shufersal', category: 'Groceries', amount: 412.5, currency: 'ILS', amount_ils: 412.5 },
  { date: '2026-04-08', merchant: 'Anthropic', category: 'Subscription', amount: 20, currency: 'USD', amount_ils: 73.4 },
  { date: '2026-04-10', merchant: 'Gett Taxi', category: 'Transport', amount: 64, currency: 'ILS', amount_ils: 64 },
  { date: '2026-04-12', merchant: 'Amazon UK', category: 'Shopping', amount: 49.99, currency: 'GBP', amount_ils: 232.45 },
  { date: '2026-04-15', merchant: 'Aroma Espresso', category: 'Food & Drink', amount: 32, currency: 'ILS', amount_ils: 32 },
  { date: '2026-04-18', merchant: 'Spotify', category: 'Subscription', amount: 19.9, currency: 'ILS', amount_ils: 19.9 },
  { date: '2026-04-20', merchant: 'Lufthansa', category: 'Travel', amount: 480, currency: 'EUR', amount_ils: 1944 },
  { date: '2026-04-22', merchant: 'Super-Pharm', category: 'Health', amount: 87.5, currency: 'ILS', amount_ils: 87.5 },
];

const html = renderEmail({ from: '2026-04-01', to: '2026-04-27', receipts });
const out = '/tmp/summer-preview.html';
fs.writeFileSync(out, html);
console.log(`wrote ${out} — open it in a browser`);
