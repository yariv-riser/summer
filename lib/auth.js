import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { getPool } from './db.js';

export const auth = betterAuth({
  database: getPool(),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      accessType: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
      ],
    },
  },
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  plugins: [nextCookies()],
});
