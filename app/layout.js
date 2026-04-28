import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import styles from "./layout.module.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: 'Summer',
  description: 'A one-click summary of your Gmail receipts.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <div className={styles['main']}>{children}</div>
        <footer className={styles['footer']}>
          <span>© {new Date().getFullYear()} Summer</span>
          <span className={styles['sep']} aria-hidden="true">·</span>
          <Link href="/privacy">Privacy</Link>
          <span className={styles['sep']} aria-hidden="true">·</span>
          <Link href="/terms">Terms</Link>
        </footer>
      </body>
    </html>
  );
}
