'use client';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import styles from './page.module.css';

export default function SignInPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const onSignIn = async () => {
    setPending(true);
    setError(null);
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/dashboard',
      });
    } catch (err) {
      setError(err?.message ?? 'Sign in failed. Please try again.');
      setPending(false);
    }
  };

  return (
    <div className={styles['page']}>
      <div className={styles['card']}>
        <h1 className={styles['title']}>Sign in to Summer</h1>
        <p className={styles['subtitle']}>
          We&apos;ll read your Gmail receipts and email a summary back to you.
        </p>
        <button
          type="button"
          className={styles['google-button']}
          onClick={onSignIn}
          disabled={pending}
        >
          {pending ? 'Redirecting…' : 'Continue with Google'}
        </button>
        {error ? (
          <p className={styles['error']} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
