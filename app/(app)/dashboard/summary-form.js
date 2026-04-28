'use client';

import { useState } from 'react';
import styles from './page.module.css';

const PRESETS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function presetRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: isoDate(from), to: isoDate(to) };
}

export default function SummaryForm() {
  const [preset, setPreset] = useState(30);
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const useCustom = showCustom && customFrom && customTo;

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setStatus('loading');

    const range = useCustom
      ? { from: customFrom, to: customTo }
      : presetRange(preset);

    try {
      const res = await fetch('/api/summary/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(range),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setStatus('queued');
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  }

  const disabled = status === 'loading' || status === 'queued';

  return (
    <form className={styles['form']} onSubmit={onSubmit}>
      <fieldset className={styles['preset-row']}>
        <legend className={styles['legend']}>Time window</legend>
        {PRESETS.map((p) => {
          const active = !useCustom && preset === p.days;
          return (
            <button
              key={p.days}
              type="button"
              onClick={() => {
                setPreset(p.days);
                setShowCustom(false);
              }}
              className={
                active
                  ? `${styles['preset-chip']} ${styles['preset-chip-active']}`
                  : styles['preset-chip']
              }
            >
              {p.label}
            </button>
          );
        })}
      </fieldset>

      <button
        type="button"
        className={styles['custom-range-link']}
        onClick={() => setShowCustom((s) => !s)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {showCustom ? 'Use a preset' : 'Custom range'}
      </button>

      {showCustom && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
            From
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              max={customTo || undefined}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
            To
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              min={customFrom || undefined}
            />
          </label>
        </div>
      )}

      <button
        type="submit"
        className={styles['submit-button']}
        disabled={disabled || (showCustom && !useCustom)}
      >
        {status === 'loading' ? 'Queuing…' : 'Generate summary'}
      </button>

      <div aria-live="polite" style={{ minHeight: '1.25rem', fontSize: '0.95rem' }}>
        {status === 'queued' && (
          <span style={{ color: '#0470c1' }}>
            Your summary is on the way — check your inbox in a minute.
          </span>
        )}
        {error && <span style={{ color: '#b00020' }}>Error: {error}</span>}
      </div>
    </form>
  );
}
