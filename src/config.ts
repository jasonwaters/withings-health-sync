import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WithingsConfig, WebhookConfig } from './types.js';

async function loadWebhooks(dataDir: string): Promise<WebhookConfig[]> {
  try {
    const webhooksPath = join(dataDir, 'webhooks.json');
    const content = await readFile(webhooksPath, 'utf-8');
    const parsed = JSON.parse(content);
    
    if (!Array.isArray(parsed)) {
      console.warn('webhooks.json must be an array, ignoring');
      return [];
    }
    
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    console.warn('Failed to load webhooks.json:', err);
    return [];
  }
}

export async function loadConfig(): Promise<WithingsConfig> {
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

  const dataDir = process.env.DATA_DIR ?? './data';
  const webhooks = await loadWebhooks(dataDir);

  return {
    clientId,
    clientSecret,
    callbackUrl,
    apiEndpoint:
      process.env.WITHINGS_API_ENDPOINT ?? 'https://wbsapi.withings.net',
    userIds,
    dataDir,
    webhooks,
  };
}
