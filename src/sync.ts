import { loadConfig } from './config.js';
import { Storage, mergeMeasurements } from './storage.js';
import { WithingsClient } from './withings-client.js';
import { decodeMeasureGroup } from './measures.js';
import { BODY_MEASURE_TYPES } from './types.js';
import { processAndSendWebhook } from './webhook.js';
import type { Tokens, DecodedMeasurement } from './types.js';

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function profileLabel(tokens: Tokens): string {
  return tokens.profileName ?? `User ${tokens.userId}`;
}

function profileKey(tokens: Tokens): string {
  if (!tokens.profileName) return String(tokens.userId);
  return tokens.profileName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

async function syncUser(
  client: WithingsClient,
  storage: Storage,
  tokens: Tokens,
  key: string,
  lastUpdate: number | null,
): Promise<{ updatetime: number }> {
  const label = profileLabel(tokens);

  const isIncremental = lastUpdate !== null && lastUpdate > 0;

  log(
    isIncremental
      ? `  Fetching new measurements since ${new Date(lastUpdate * 1000).toISOString()}...`
      : `  Fetching full measurement history...`,
  );

  const { measureGroups, updatetime } = await client.getMeasures({
    meastypes: BODY_MEASURE_TYPES,
    category: 1,
    ...(isIncremental ? { lastupdate: lastUpdate } : {}),
  });

  log(`  Received ${measureGroups.length} measurement groups`);

  if (measureGroups.length === 0) {
    return { updatetime: updatetime || lastUpdate || 0 };
  }

  const decoded: DecodedMeasurement[] = measureGroups.map(decodeMeasureGroup);

  const existing = await storage.loadMeasurements(key);
  const merged = mergeMeasurements(existing, decoded);
  await storage.saveMeasurements(key, merged);

  const newCount = merged.length - existing.length;
  const updatedCount = decoded.length - newCount;

  log(
    `  ${label}: ${newCount} new, ${updatedCount} updated, ${merged.length} total`,
  );

  return { updatetime };
}

async function enrichWithHeight(
  storage: Storage,
  key: string,
): Promise<void> {
  const measurements = await storage.loadMeasurements(key);
  const heightEntry = measurements.find((m) => m.measures.height_m);

  if (!heightEntry) return;

  const heightM = heightEntry.measures.height_m;
  if (!heightM || heightM <= 0) return;

  let enriched = false;
  for (const m of measurements) {
    if (m.measures.weight_kg && !m.measures.bmi) {
      m.measures.bmi = parseFloat(
        (m.measures.weight_kg / (heightM * heightM)).toFixed(2),
      );
      enriched = true;
    }
  }

  if (enriched) {
    await storage.saveMeasurements(key, measurements);
  }
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const storage = new Storage(config.dataDir);

  log('Starting Withings Health Sync');

  const tokenStore = await storage.loadTokenStore();
  let userIds = Object.keys(tokenStore).map(Number);

  if (userIds.length === 0) {
    log('No authorized profiles found. Run: npm run authorize');
    process.exit(1);
  }

  if (config.userIds?.length) {
    const filterSet = new Set(config.userIds);
    userIds = userIds.filter((id) => filterSet.has(id));
    log(`Filtered to ${userIds.length} profile(s) by WITHINGS_USER_IDS`);
  }

  log(`Syncing ${userIds.length} profile(s)`);

  const syncState = await storage.loadSyncState();

  for (const userid of userIds) {
    const tokens = tokenStore[String(userid)];
    const label = profileLabel(tokens);
    const key = profileKey(tokens);
    log(`Syncing: ${label} (userid: ${userid}, file: measurements-${key}.json)`);

    const client = new WithingsClient(config, storage, tokens);

    log('  Refreshing access token...');
    await client.refreshAccessToken();
    log('  Token refreshed');

    const userState = storage.getUserSyncState(syncState, userid);
    const lastUpdate = userState?.lastUpdate ?? null;

    const { updatetime } = await syncUser(
      client,
      storage,
      tokens,
      key,
      lastUpdate,
    );

    await enrichWithHeight(storage, key);

    const allMeasurements = await storage.loadMeasurements(key);

    const oldest = allMeasurements.length > 0
      ? allMeasurements[allMeasurements.length - 1].date
      : null;
    const newest = allMeasurements.length > 0
      ? allMeasurements[0].date
      : null;

    storage.setUserSyncState(syncState, userid, {
      name: label,
      lastUpdate: updatetime,
      lastSyncAt: new Date().toISOString(),
      totalRecords: allMeasurements.length,
      oldestRecord: oldest,
      newestRecord: newest,
    });

    await storage.saveSyncState(syncState);

    if (config.webhooks) {
      const webhookConfig = config.webhooks.find(
        (wh) => wh.profileKey === key,
      );
      if (webhookConfig) {
        log(`  Sending ${webhookConfig.count ?? 3} measurements to webhook...`);
        try {
          await processAndSendWebhook(webhookConfig, allMeasurements, tokens.profileName);
          log('  Webhook sent successfully');
        } catch (err) {
          log(`  Webhook failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  log('Sync complete!');

  for (const userid of userIds) {
    const tokens = tokenStore[String(userid)];
    const label = profileLabel(tokens);
    const state = storage.getUserSyncState(syncState, userid);
    if (state) {
      log(
        `  ${label}: ${state.totalRecords} records (${state.oldestRecord?.split('T')[0] ?? '?'} to ${state.newestRecord?.split('T')[0] ?? '?'})`,
      );
    }
  }
}

main().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
