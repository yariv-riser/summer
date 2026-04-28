// Parses schema.org JSON-LD (and a small slice of microdata) embedded in
// receipt emails — the same markup Gmail itself reads to populate the
// Purchases category. When present, this skips the LLM extraction call.

const JSONLD_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const ORDER_TYPES = new Set([
  'Order',
  'OrderConfirmation',
  'Invoice',
  'ParcelDelivery',
  'FlightReservation',
  'LodgingReservation',
  'EventReservation',
  'RentalCarReservation',
  'FoodEstablishmentReservation',
  'TrainReservation',
  'BusReservation',
]);

export function extractFromSchemaOrg({ rawHtml, date: emailDate }) {
  if (!rawHtml) return null;

  const nodes = [];
  for (const match of rawHtml.matchAll(JSONLD_RE)) {
    const json = safeJson(match[1]);
    if (json) collectNodes(json, nodes);
  }
  if (!nodes.length) return null;

  const candidates = nodes
    .map((n) => normalize(n))
    .filter((r) => r && r.amount != null);

  if (!candidates.length) return null;

  // Prefer the largest total — handles multi-node trees where Order and
  // ParcelDelivery both appear and one carries the price.
  const best = candidates.reduce((a, b) => (b.amount > a.amount ? b : a));
  if (!best.date) best.date = isoDate(emailDate);
  return best;
}

function safeJson(str) {
  try {
    // Some senders escape entities or wrap the script in HTML comments.
    const cleaned = str.replace(/^\s*<!--/, '').replace(/-->\s*$/, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function collectNodes(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectNodes(item, out);
    return;
  }
  if (node['@graph']) collectNodes(node['@graph'], out);
  out.push(node);
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (v && typeof v === 'object') collectNodes(v, out);
  }
}

function normalize(node) {
  const types = toArray(node['@type']).map(stripContext);
  if (!types.some((t) => ORDER_TYPES.has(t))) return null;

  const order = node.partOfOrder || node;
  const price = pickPrice(order) || pickPrice(node);
  if (!price) return null;

  return {
    is_receipt: true,
    merchant: pickMerchant(order) || pickMerchant(node),
    amount: price.amount,
    currency: price.currency,
    date: pickDate(order) || pickDate(node),
    category: null,
    source: 'schema-org',
  };
}

function pickPrice(node) {
  const total = node.totalPaymentDue || node.totalPrice || node.price;
  if (total && typeof total === 'object') {
    const amount = numeric(total.value ?? total.price);
    const currency = total.priceCurrency || total.currency;
    if (amount != null) return { amount, currency: currency || null };
  }
  if (typeof total === 'number' || typeof total === 'string') {
    const amount = numeric(total);
    if (amount != null) return { amount, currency: node.priceCurrency || null };
  }
  return null;
}

function pickMerchant(node) {
  const candidate =
    node.seller || node.merchant || node.provider || node.broker || node.organizer;
  if (!candidate) return null;
  if (typeof candidate === 'string') return candidate;
  return candidate.name || null;
}

function pickDate(node) {
  const raw =
    node.orderDate ||
    node.purchaseDate ||
    node.startDate ||
    node.checkinDate ||
    node.modifiedDate;
  return isoDate(raw);
}

function isoDate(input) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function numeric(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toArray(v) {
  return Array.isArray(v) ? v : v ? [v] : [];
}

function stripContext(t) {
  return typeof t === 'string' ? t.replace(/^https?:\/\/schema\.org\//, '') : t;
}
