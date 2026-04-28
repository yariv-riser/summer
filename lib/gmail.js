const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailFetch(accessToken, path, init = {}) {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail ${init.method || 'GET'} ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

export async function listMessages(accessToken, { q, maxResults = 200 }) {
  const ids = [];
  let pageToken;
  do {
    const params = new URLSearchParams({ q, maxResults: String(Math.min(maxResults - ids.length, 100)) });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await gmailFetch(accessToken, `/messages?${params}`);
    for (const m of data.messages || []) ids.push(m.id);
    pageToken = data.nextPageToken;
    if (ids.length >= maxResults) break;
  } while (pageToken);
  return ids.slice(0, maxResults);
}

export async function getMessage(accessToken, id) {
  return gmailFetch(accessToken, `/messages/${id}?format=full`);
}

export function extractBody(message, maxChars = 4000) {
  const headers = Object.fromEntries(
    (message.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value])
  );

  const plain = findPart(message.payload, 'text/plain');
  const html = findPart(message.payload, 'text/html');
  const rawHtml = html ? decodeBase64Url(html.body.data) : '';
  let body = '';
  if (plain) body = decodeBase64Url(plain.body.data);
  else if (rawHtml) body = stripHtml(rawHtml);

  return {
    subject: headers.subject || '',
    from: headers.from || '',
    date: headers.date || '',
    snippet: message.snippet || '',
    body: body.slice(0, maxChars),
    rawHtml,
  };
}

function findPart(part, mimeType) {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts || []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

function decodeBase64Url(data) {
  if (!data) return '';
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64').toString('utf-8');
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function sendMessage(accessToken, { from, to, subject, html }) {
  const rfc2822 = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ].join('\r\n');

  const raw = Buffer.from(rfc2822, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return gmailFetch(accessToken, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw }),
  });
}
