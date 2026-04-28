import { auth } from './auth.js';

export async function getValidAccessToken(userId) {
  const tokens = await auth.api.getAccessToken({
    body: { providerId: 'google', userId },
  });
  if (!tokens?.accessToken) {
    throw new Error('No Google access token available for user');
  }
  return tokens.accessToken;
}
