// Per-day in-memory cache of ILS-base FX rates.
// rates[date][currency] = units of <currency> per 1 ILS.

const cache = new Map();

async function fetchRates(date) {
  if (cache.has(date)) return cache.get(date);
  const url = `https://api.exchangerate.host/${date}?base=ILS`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fx ${date} ${res.status}`);
  const data = await res.json();
  if (!data.rates) throw new Error(`fx ${date} no rates`);
  cache.set(date, data.rates);
  return data.rates;
}

export async function convertReceipts(receipts) {
  const dates = [...new Set(receipts.map((r) => r.date).filter(Boolean))].sort();
  const ratesByDate = new Map();
  let lastGoodRates = null;

  for (const d of dates) {
    try {
      const r = await fetchRates(d);
      ratesByDate.set(d, r);
      lastGoodRates = r;
    } catch (err) {
      console.warn(`fx fetch failed for ${d}:`, err.message);
      if (lastGoodRates) ratesByDate.set(d, lastGoodRates);
    }
  }

  return receipts.map((r) => {
    if (r.amount == null || !r.currency) {
      return { ...r, amount_ils: null, fx_unconverted: true };
    }
    if (r.currency === 'ILS') {
      return { ...r, amount_ils: r.amount, fx_unconverted: false };
    }
    const rates = ratesByDate.get(r.date) || lastGoodRates;
    const rate = rates?.[r.currency];
    if (!rate) {
      return { ...r, amount_ils: null, fx_unconverted: true };
    }
    return { ...r, amount_ils: r.amount / rate, fx_unconverted: false };
  });
}
