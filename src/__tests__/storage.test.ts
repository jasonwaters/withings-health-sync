import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Storage, mergeMeasurements } from '../storage.js';
import type { DecodedMeasurement, Tokens, UserProfile } from '../types.js';

const TEST_USER_ID_1 = 1000001;
const TEST_USER_ID_2 = 1000002;

function makeMeasurement(
  grpid: number,
  timestamp: number,
  weightKg = 74,
): DecodedMeasurement {
  return {
    grpid,
    date: new Date(timestamp * 1000).toISOString(),
    timestamp,
    category: 1,
    attrib: 0,
    deviceid: null,
    measures: { weight_kg: weightKg },
    raw: [{ value: weightKg * 1000, type: 1, unit: -3 }],
  };
}

describe('mergeMeasurements', () => {
  it('merges without duplicates using grpid', () => {
    const existing = [
      makeMeasurement(1, 1000),
      makeMeasurement(2, 900),
    ];
    const incoming = [
      makeMeasurement(2, 900, 75),
      makeMeasurement(3, 800),
    ];

    const merged = mergeMeasurements(existing, incoming);

    expect(merged).toHaveLength(3);
    expect(merged.map((m) => m.grpid)).toEqual([1, 2, 3]);
  });

  it('incoming records overwrite existing with same grpid', () => {
    const existing = [makeMeasurement(1, 1000, 74)];
    const incoming = [makeMeasurement(1, 1000, 75)];

    const merged = mergeMeasurements(existing, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].measures.weight_kg).toBe(75);
  });

  it('sorts by timestamp descending (newest first)', () => {
    const existing = [makeMeasurement(1, 500)];
    const incoming = [
      makeMeasurement(2, 1000),
      makeMeasurement(3, 100),
    ];

    const merged = mergeMeasurements(existing, incoming);

    expect(merged[0].timestamp).toBe(1000);
    expect(merged[1].timestamp).toBe(500);
    expect(merged[2].timestamp).toBe(100);
  });

  it('handles empty existing list', () => {
    const incoming = [makeMeasurement(1, 1000)];
    const merged = mergeMeasurements([], incoming);

    expect(merged).toHaveLength(1);
  });

  it('handles empty incoming list', () => {
    const existing = [makeMeasurement(1, 1000)];
    const merged = mergeMeasurements(existing, []);

    expect(merged).toHaveLength(1);
  });
});

describe('Storage', () => {
  let tmpDir: string;
  let storage: Storage;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'whsync-test-'));
    storage = new Storage(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('token store', () => {
    it('returns empty store when no tokens exist', async () => {
      const store = await storage.loadTokenStore();
      expect(store).toEqual({});
    });

    it('stores and retrieves tokens per userid', async () => {
      const tokens: Tokens = {
        accessToken: 'access-aaa',
        refreshToken: 'refresh-aaa',
        userId: TEST_USER_ID_1,
        expiresAt: Date.now() + 10800000,
        profileName: 'alice',
      };

      await storage.saveUserTokens(TEST_USER_ID_1, tokens);
      const loaded = await storage.loadUserTokens(TEST_USER_ID_1);

      expect(loaded).toEqual(tokens);
    });

    it('supports multiple users in the same store', async () => {
      await storage.saveUserTokens(TEST_USER_ID_1, {
        accessToken: 'a1',
        refreshToken: 'r1',
        userId: TEST_USER_ID_1,
      });
      await storage.saveUserTokens(TEST_USER_ID_2, {
        accessToken: 'a2',
        refreshToken: 'r2',
        userId: TEST_USER_ID_2,
      });

      const store = await storage.loadTokenStore();

      expect(Object.keys(store)).toHaveLength(2);
      expect(store[String(TEST_USER_ID_1)].accessToken).toBe('a1');
      expect(store[String(TEST_USER_ID_2)].accessToken).toBe('a2');
    });

    it('migrates legacy single-user tokens.json on load', async () => {
      const legacyTokens = {
        accessToken: 'legacy-access',
        refreshToken: 'legacy-refresh',
        userId: TEST_USER_ID_1,
        expiresAt: 1775182263376,
      };

      await fs.writeFile(
        path.join(tmpDir, 'tokens.json'),
        JSON.stringify(legacyTokens, null, 2),
      );

      const store = await storage.loadTokenStore();

      expect(Object.keys(store)).toHaveLength(1);
      expect(store[String(TEST_USER_ID_1)].accessToken).toBe('legacy-access');
      expect(store[String(TEST_USER_ID_1)].userId).toBe(TEST_USER_ID_1);
    });

    it('returns authorized user ids', async () => {
      await storage.saveUserTokens(TEST_USER_ID_1, {
        accessToken: 'a1',
        refreshToken: 'r1',
        userId: TEST_USER_ID_1,
      });
      await storage.saveUserTokens(TEST_USER_ID_2, {
        accessToken: 'a2',
        refreshToken: 'r2',
        userId: TEST_USER_ID_2,
      });

      const ids = await storage.getAuthorizedUserIds();
      expect(ids.sort()).toEqual([TEST_USER_ID_1, TEST_USER_ID_2]);
    });

    it('returns null for unknown user', async () => {
      const tokens = await storage.loadUserTokens(99999);
      expect(tokens).toBeNull();
    });
  });

  describe('user profiles', () => {
    it('returns empty array when no profiles exist', async () => {
      const profiles = await storage.loadUserProfiles();
      expect(profiles).toEqual([]);
    });

    it('round-trips profiles', async () => {
      const profiles: UserProfile[] = [
        { userid: TEST_USER_ID_1, firstname: 'Alice', lastname: 'Test' },
        { userid: TEST_USER_ID_2, firstname: 'Bob', lastname: 'Test' },
      ];

      await storage.saveUserProfiles(profiles);
      const loaded = await storage.loadUserProfiles();

      expect(loaded).toEqual(profiles);
    });
  });

  describe('measurements', () => {
    it('returns empty array when no measurements exist', async () => {
      const data = await storage.loadMeasurements('unknown');
      expect(data).toEqual([]);
    });

    it('round-trips measurements per profile key', async () => {
      const data = [makeMeasurement(1, 1000), makeMeasurement(2, 900)];

      await storage.saveMeasurements('alice', data);
      await storage.saveMeasurements('bob', [makeMeasurement(3, 800)]);

      const loadedAlice = await storage.loadMeasurements('alice');
      const loadedBob = await storage.loadMeasurements('bob');

      expect(loadedAlice).toHaveLength(2);
      expect(loadedBob).toHaveLength(1);
      expect(loadedBob[0].grpid).toBe(3);
    });
  });

  describe('sync state', () => {
    it('returns empty state when no file exists', async () => {
      const state = await storage.loadSyncState();
      expect(state).toEqual({ users: {} });
    });

    it('stores and retrieves per-user sync state', async () => {
      const state = await storage.loadSyncState();

      storage.setUserSyncState(state, TEST_USER_ID_1, {
        name: 'Alice Test',
        lastUpdate: 1700000000,
        lastSyncAt: '2024-01-01T00:00:00Z',
        totalRecords: 500,
        oldestRecord: '2019-01-01T00:00:00Z',
        newestRecord: '2024-01-01T00:00:00Z',
      });

      await storage.saveSyncState(state);
      const loaded = await storage.loadSyncState();
      const userState = storage.getUserSyncState(loaded, TEST_USER_ID_1);

      expect(userState?.name).toBe('Alice Test');
      expect(userState?.totalRecords).toBe(500);
    });
  });
});
