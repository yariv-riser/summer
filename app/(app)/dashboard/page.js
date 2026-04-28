import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import SignOutButton from './sign-out-button';
import SummaryForm from './summary-form';
import styles from './page.module.css';

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/sign-in');

  return (
    <div className={styles['page']}>
      <header className={styles['header']}>
        <div className={styles['header-row']}>
          <h1 className={styles['title']}>Summer</h1>
          <SignOutButton />
        </div>
        <p className={styles['subtitle']}>
          Hi {session.user.name || session.user.email}. Pick a window — we&apos;ll
          email the summary to your inbox.
        </p>
      </header>

      <SummaryForm />
    </div>
  );
}
