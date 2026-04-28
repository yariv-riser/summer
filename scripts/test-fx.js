// bun scripts/test-fx.js
import { convertReceipts } from '../lib/fx.js';

const fixtures = [
  { date: '2026-04-08', merchant: 'Anthropic', amount: 20, currency: 'USD' },
  { date: '2026-04-12', merchant: 'Amazon UK', amount: 49.99, currency: 'GBP' },
  { date: '2026-04-20', merchant: 'Lufthansa', amount: 480, currency: 'EUR' },
  { date: '2026-04-15', merchant: 'Aroma', amount: 32, currency: 'ILS' },
];

console.log(await convertReceipts(fixtures));
