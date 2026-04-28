import { GoogleGenAI, Type } from '@google/genai';
import { extractFromSchemaOrg } from './schema-org.js';

const MODEL = 'gemini-2.5-flash-lite';

// Free-tier limit is 15 RPM. We serialize and enforce a minimum gap to
// stay safely under that. The (yet-unwritten) worker pipeline must chunk
// long batches across multiple invocations, since 60s won't cover many
// LLM calls at this rate.
const MIN_REQUEST_GAP_MS = 4500;

const SYSTEM_PROMPT = `You extract structured receipt data from email content. Given an email's subject, sender, and body text, return JSON with this exact shape:

{
  "is_receipt": boolean,
  "merchant": string | null,
  "amount": number | null,
  "currency": string | null,
  "date": string | null,
  "category": string | null
}

Rules:
- If the email is not a receipt or order confirmation, set is_receipt to false and all other fields to null.
- Prefer the date the purchase was made over the email send date.
- Currency must be a 3-letter ISO 4217 code; infer from symbols (₪→ILS, $→USD, €→EUR, £→GBP).
- Pick a short, generic category. Re-use the same label for similar purchases across the batch (e.g., always "Food & Drink", not sometimes "Restaurant").

Output only valid JSON. No prose.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    is_receipt: { type: Type.BOOLEAN },
    merchant: { type: Type.STRING, nullable: true },
    amount: { type: Type.NUMBER, nullable: true },
    currency: { type: Type.STRING, nullable: true },
    date: { type: Type.STRING, nullable: true },
    category: { type: Type.STRING, nullable: true },
  },
  required: ['is_receipt', 'merchant', 'amount', 'currency', 'date', 'category'],
  propertyOrdering: ['is_receipt', 'merchant', 'amount', 'currency', 'date', 'category'],
};

const CATEGORY_MAP = {
  restaurant: 'Food & Drink',
  cafe: 'Food & Drink',
  food: 'Food & Drink',
  dining: 'Food & Drink',
  groceries: 'Groceries',
  grocery: 'Groceries',
  supermarket: 'Groceries',
  transport: 'Transport',
  transportation: 'Transport',
  taxi: 'Transport',
  rideshare: 'Transport',
  uber: 'Transport',
  fuel: 'Transport',
  gas: 'Transport',
  flight: 'Travel',
  airline: 'Travel',
  hotel: 'Travel',
  travel: 'Travel',
  subscription: 'Subscription',
  saas: 'Subscription',
  software: 'Subscription',
  shopping: 'Shopping',
  retail: 'Shopping',
  clothing: 'Shopping',
  electronics: 'Electronics',
  entertainment: 'Entertainment',
  streaming: 'Entertainment',
  health: 'Health',
  pharmacy: 'Health',
  medical: 'Health',
  utilities: 'Utilities',
  utility: 'Utilities',
};

function normalizeCategory(raw) {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  return CATEGORY_MAP[key] || raw.trim();
}

function notReceipt() {
  return { is_receipt: false, merchant: null, amount: null, currency: null, date: null, category: null };
}

export async function extractOne(client, { subject, from, date, body }) {
  try {
    const res = await client.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: `Subject: ${subject}\nFrom: ${from}\nDate: ${date}\n\n${body}` }],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 512,
      },
    });

    const text = res.text;
    if (!text) return notReceipt();
    const data = JSON.parse(text);
    if (!data.is_receipt) return notReceipt();
    return {
      is_receipt: true,
      merchant: data.merchant,
      amount: data.amount,
      currency: data.currency,
      date: data.date,
      category: normalizeCategory(data.category),
      source: 'llm',
    };
  } catch (err) {
    console.warn('extract failed:', err.message);
    return notReceipt();
  }
}

export async function extractMany(emails, { apiKey } = {}) {
  const results = new Array(emails.length);
  const llmIndexes = [];

  // Pre-pass: schema.org JSON-LD / microdata. Free, fast, more accurate
  // than the LLM for senders that ship structured markup.
  for (let i = 0; i < emails.length; i++) {
    const fromMarkup = extractFromSchemaOrg(emails[i]);
    if (fromMarkup) {
      results[i] = { ...fromMarkup, category: normalizeCategory(fromMarkup.category) };
    } else {
      llmIndexes.push(i);
    }
  }

  if (!llmIndexes.length) return results;

  const client = new GoogleGenAI({ apiKey: apiKey || process.env.GEMINI_API_KEY });
  let nextSlot = 0;

  for (const i of llmIndexes) {
    const wait = nextSlot - Date.now();
    if (wait > 0) await sleep(wait);
    nextSlot = Date.now() + MIN_REQUEST_GAP_MS;
    results[i] = await extractOne(client, emails[i]);
  }

  return results;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
