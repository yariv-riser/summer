// Usage: bun scripts/test-gmail.js <userId> [days]
// Lists category:purchases for the last N days and prints decoded bodies.

import { getValidAccessToken } from '../lib/google-auth.js';
import { listMessages, getMessage, extractBody } from '../lib/gmail.js';

const userId = process.argv[2];
const days = Number(process.argv[3] || 30);

if (!userId) {
  console.error('Usage: bun scripts/test-gmail.js <userId> [days]');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const after = now - days * 86400;
const q = `category:purchases after:${after} before:${now}`;

const accessToken = await getValidAccessToken(userId);
console.log(`✓ got access token (${accessToken.slice(0, 12)}…)`);

const ids = await listMessages(accessToken, { q, maxResults: 10 });
console.log(`✓ found ${ids.length} messages for q="${q}"`);

for (const id of ids) {
  const msg = await getMessage(accessToken, id);
  const { subject, from, date, snippet, body } = extractBody(msg, 500);
  console.log('\n────────────────────────────────────────');
  console.log(`id:      ${id}`);
  console.log(`from:    ${from}`);
  console.log(`subject: ${subject}`);
  console.log(`date:    ${date}`);
  console.log(`snippet: ${snippet}`);
  console.log(`body:    ${body.slice(0, 300)}…`);
}
