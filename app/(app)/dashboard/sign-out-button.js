'use client';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import styles from './page.module.css';

export default function SignOutButton() {
  const router = useRouter();

  const onSignOut = async () => {
    await authClient.signOut();
    router.replace('/sign-in');
    router.refresh();
  };

  return (
    <button
      type="button"
      className={styles['sign-out-button']}
      onClick={onSignOut}
    >
      Sign out
    </button>
  );
}
