import Link from 'next/link';
import styles from '../legal.module.css';

export const metadata = {
  title: 'Privacy Policy — Summer',
  description: 'How Summer handles your data.',
};

export default function PrivacyPage() {
  return (
    <div className={styles['page']}>
      <Link href="/" className={styles['back-link']}>
        ← Back
      </Link>
      <h1 className={styles['title']}>Privacy Policy</h1>
      <p className={styles['updated']}>Last updated: April 28, 2026</p>

      <p>
        Summer is a personal-scale tool that summarises receipts and invoices from
        your Gmail inbox. This page explains what data passes through it and what
        does not.
      </p>

      <h2>Data we receive from you</h2>
      <ul>
        <li>
          <strong>Google account profile.</strong> When you sign in we receive your
          name, email address, and Google account ID via Google OAuth.
        </li>
        <li>
          <strong>Gmail OAuth tokens.</strong> Access and refresh tokens for the
          scopes you grant: <code>gmail.readonly</code> and <code>gmail.send</code>.
          These let Summer read receipt-candidate messages and email the summary
          back to your own inbox.
        </li>
        <li>
          <strong>Session cookies.</strong> Standard authentication cookies issued
          by <a href="https://www.better-auth.com">better-auth</a>.
        </li>
      </ul>

      <h2>What we store</h2>
      <p>
        Only the data above — profile, OAuth tokens, sessions — in a Postgres
        database hosted on Supabase. <strong>We do not store the contents of your
        emails, the extracted receipts, or the generated summaries.</strong> Each
        run is computed from scratch in memory and discarded when the worker
        finishes.
      </p>

      <h2>How your email is processed</h2>
      <p>
        When you click <em>Generate summary</em>, a background worker:
      </p>
      <ul>
        <li>Fetches purchase-related messages from Gmail in your selected window.</li>
        <li>
          Extracts structured fields (merchant, amount, currency, date) using
          embedded schema.org markup where available, falling back to Google
          Gemini (model <code>gemini-2.5-flash-lite</code>) for the rest. Email
          content is sent to the Gemini API to perform this extraction.
        </li>
        <li>Converts amounts to ILS using public ECB rates from frankfurter.dev.</li>
        <li>Sends the rendered HTML summary back to you via your own Gmail account.</li>
      </ul>
      <p>
        Note that Google&apos;s Gemini API may retain prompt content for abuse
        monitoring per its own terms. See{' '}
        <a href="https://ai.google.dev/gemini-api/terms">Gemini API terms</a>.
      </p>

      <h2>Third parties involved</h2>
      <ul>
        <li><strong>Google (OAuth + Gmail API)</strong> — sign-in and email read/send.</li>
        <li><strong>Google Gemini API</strong> — receipt extraction.</li>
        <li><strong>Supabase</strong> — Postgres hosting for the auth tables.</li>
        <li><strong>Upstash QStash</strong> — background job queue.</li>
        <li><strong>Vercel</strong> — application hosting.</li>
        <li><strong>frankfurter.dev</strong> — currency exchange rates.</li>
      </ul>

      <h2>Use of Google user data</h2>
      <p>
        Summer&apos;s use of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Your Gmail data is used solely
        to produce the requested summary and is not sold, used for advertising,
        or shared with third parties beyond the processors listed above.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          Revoke access at any time via{' '}
          <a href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          . Doing so invalidates the stored OAuth tokens.
        </li>
        <li>
          Request deletion of your account record by contacting the address below.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions or deletion requests:{' '}
        <a href="mailto:yariv@riser.co.il">yariv@riser.co.il</a>.
      </p>
    </div>
  );
}
