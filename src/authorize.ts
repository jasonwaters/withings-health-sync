import readline from 'node:readline/promises';
import { loadConfig } from './config.js';
import { Storage } from './storage.js';
import { WithingsClient } from './withings-client.js';

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const storage = new Storage(config.dataDir);

  const existingStore = await storage.loadTokenStore();
  const existingIds = Object.keys(existingStore);

  if (existingIds.length > 0) {
    console.log('\nAlready authorized profiles:');
    for (const id of existingIds) {
      const t = existingStore[id];
      const label = t.profileName ?? `User ${t.userId}`;
      console.log(`  - ${label} (userid: ${t.userId})`);
    }
    console.log('');
  }

  const authUrl = WithingsClient.getAuthorizationUrl(config);

  console.log('='.repeat(60));
  console.log('WITHINGS AUTHORIZATION');
  console.log('='.repeat(60));
  console.log('\nOpen this URL in your browser:\n');
  console.log(authUrl);
  console.log(
    '\nSelect the profile you want to authorize, then copy the',
  );
  console.log(
    'authorization code from the callback page and paste it below.',
  );
  console.log(
    '\nRepeat this process for each family member profile.',
  );
  console.log('='.repeat(60) + '\n');

  const code = await prompt('Enter authorization code: ');

  if (!code) {
    console.error('No authorization code provided.');
    process.exit(1);
  }

  console.log('\nExchanging code for tokens...');

  const tokens = await WithingsClient.exchangeCodeForToken(
    config,
    storage,
    code,
  );

  const profileName = await prompt(
    `Enter a name for this profile (userid ${tokens.userId}), or press Enter to skip: `,
  );

  if (profileName) {
    tokens.profileName = profileName;
    await storage.saveUserTokens(tokens.userId, tokens);
  }

  const allIds = await storage.getAuthorizedUserIds();

  console.log('\nAuthorization successful!');
  console.log(`  User ID: ${tokens.userId}`);
  console.log(
    `  Profile: ${tokens.profileName ?? '(unnamed)'}`,
  );
  console.log(`  Total authorized profiles: ${allIds.length}`);
  console.log(`  Tokens saved to: ${config.dataDir}/tokens.json`);

  if (allIds.length < 5) {
    console.log(
      '\nTo authorize another profile, run: npm run authorize',
    );
  }
  console.log('To sync all authorized profiles, run: npm run sync');
}

main().catch((err) => {
  console.error('Authorization failed:', err.message);
  process.exit(1);
});
