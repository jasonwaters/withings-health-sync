import { loadConfig } from './config.js';
import { Storage } from './storage.js';
import { processAndSendWebhook } from './webhook.js';

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const storage = new Storage(config.dataDir);

  if (!config.webhooks || config.webhooks.length === 0) {
    log('No webhooks configured in data/webhooks.json');
    process.exit(0);
  }

  log(`Found ${config.webhooks.length} webhook(s) configured`);

  const tokenStore = await storage.loadTokenStore();
  const errors: Array<{ profileKey: string; error: string }> = [];

  for (const webhookConfig of config.webhooks) {
    const profileKey = webhookConfig.profileKey;
    log(`Processing webhook for profile: ${profileKey}`);

    try {
      const allMeasurements = await storage.loadMeasurements(profileKey);

      if (allMeasurements.length === 0) {
        log(`  No measurements found for ${profileKey}, skipping`);
        continue;
      }

      const userToken = Object.values(tokenStore).find(
        (t) => t.profileName?.toLowerCase().replace(/[^a-z0-9]+/g, '-') === profileKey || 
               String(t.userId) === profileKey
      );
      const profileName = userToken?.profileName;

      const count = webhookConfig.lookbackTime
        ? `measurements from last ${webhookConfig.lookbackTime}`
        : `${webhookConfig.count ?? 3} latest measurements`;
      log(`  Sending ${count} to webhook...`);
      
      await processAndSendWebhook(webhookConfig, allMeasurements, profileName);
      
      log('  ✓ Webhook sent successfully');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log(`  ✗ Webhook failed: ${errorMsg}`);
      errors.push({ profileKey, error: errorMsg });
    }
  }

  log('Webhook processing complete!');

  if (errors.length > 0) {
    log('\nErrors encountered:');
    for (const { profileKey, error } of errors) {
      log(`  ✗ ${profileKey}: ${error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Webhook send failed:', err.message);
  process.exit(1);
});
