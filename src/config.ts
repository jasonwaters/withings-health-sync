import 'dotenv/config';
import type { WithingsConfig } from './types.js';

export function loadConfig(): WithingsConfig {
  const clientId = process.env.WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;
  const callbackUrl = process.env.WITHINGS_CALLBACK_URL;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing WITHINGS_CLIENT_ID or WITHINGS_CLIENT_SECRET in .env',
    );
  }

  if (!callbackUrl) {
    throw new Error('Missing WITHINGS_CALLBACK_URL in .env');
  }

  const userIdsRaw = process.env.WITHINGS_USER_IDS?.trim();
  const userIds = userIdsRaw
    ? userIdsRaw.split(',').map((id) => parseInt(id.trim(), 10)).filter(Boolean)
    : undefined;

  return {
    clientId,
    clientSecret,
    callbackUrl,
    apiEndpoint:
      process.env.WITHINGS_API_ENDPOINT ?? 'https://wbsapi.withings.net',
    userIds,
    dataDir: process.env.DATA_DIR ?? './data',
  };
}
