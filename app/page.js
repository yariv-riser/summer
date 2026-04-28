import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import styles from './page.module.css';

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/dashboard');

  return (
    <div className={styles['page']}>
      <main className={styles['hero']}>
        <h1 className={styles['wordmark']}>Summer</h1>
        <p className={styles['tagline']}>
          One click. A tidy summary of your Gmail receipts.
        </p>
        <Link href="/sign-in" className={styles['cta']}>
          Sign in to get started
        </Link>
      </main>
    </div>
  );
}
