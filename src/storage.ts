import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  Tokens,
  TokenStore,
  DecodedMeasurement,
  SyncState,
  UserProfile,
  UserSyncState,
} from './types.js';

export class Storage {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private filePath(filename: string): string {
    return path.join(this.dataDir, filename);
  }

  async ensureDataDir(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  private async readJson<T>(filename: string): Promise<T | null> {
    try {
      const content = await fs.readFile(this.filePath(filename), 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  private async writeJson(filename: string, data: unknown): Promise<void> {
    await this.ensureDataDir();
    await fs.writeFile(
      this.filePath(filename),
      JSON.stringify(data, null, 2) + '\n',
    );
  }

  async loadTokenStore(): Promise<TokenStore> {
    const raw = await this.readJson<TokenStore | Tokens>('tokens.json');
    if (!raw) return {};
    return this.migrateTokenFormat(raw);
  }

  /**
   * Transparently upgrades from the single-user Tokens format
   * (flat object with accessToken at the root) to the multi-user
   * TokenStore format (keyed by userid).
   */
  private migrateTokenFormat(raw: TokenStore | Tokens): TokenStore {
    if ('accessToken' in raw && 'userId' in raw) {
      const legacy = raw as Tokens;
      return { [String(legacy.userId)]: legacy };
    }
    return raw as TokenStore;
  }

  async saveTokenStore(store: TokenStore): Promise<void> {
    await this.writeJson('tokens.json', store);
  }

  async loadUserTokens(userid: number): Promise<Tokens | null> {
    const store = await this.loadTokenStore();
    return store[String(userid)] ?? null;
  }

  async saveUserTokens(userid: number, tokens: Tokens): Promise<void> {
    const store = await this.loadTokenStore();
    store[String(userid)] = tokens;
    await this.saveTokenStore(store);
  }

  async getAuthorizedUserIds(): Promise<number[]> {
    const store = await this.loadTokenStore();
    return Object.keys(store).map(Number);
  }

  async loadUserProfiles(): Promise<UserProfile[]> {
    return (await this.readJson<UserProfile[]>('users.json')) ?? [];
  }

  async saveUserProfiles(profiles: UserProfile[]): Promise<void> {
    await this.writeJson('users.json', profiles);
  }

  async loadMeasurements(profileKey: string): Promise<DecodedMeasurement[]> {
    return (
      (await this.readJson<DecodedMeasurement[]>(
        `measurements-${profileKey}.json`,
      )) ?? []
    );
  }

  async saveMeasurements(
    profileKey: string,
    data: DecodedMeasurement[],
  ): Promise<void> {
    await this.writeJson(`measurements-${profileKey}.json`, data);
  }

  async loadSyncState(): Promise<SyncState> {
    return (await this.readJson<SyncState>('sync-state.json')) ?? { users: {} };
  }

  async saveSyncState(state: SyncState): Promise<void> {
    await this.writeJson('sync-state.json', state);
  }

  getUserSyncState(
    syncState: SyncState,
    userid: number,
  ): UserSyncState | null {
    return syncState.users[String(userid)] ?? null;
  }

  setUserSyncState(
    syncState: SyncState,
    userid: number,
    state: UserSyncState,
  ): void {
    syncState.users[String(userid)] = state;
  }
}

export function mergeMeasurements(
  existing: DecodedMeasurement[],
  incoming: DecodedMeasurement[],
): DecodedMeasurement[] {
  const byGrpId = new Map<number, DecodedMeasurement>();

  for (const m of existing) {
    byGrpId.set(m.grpid, m);
  }

  for (const m of incoming) {
    byGrpId.set(m.grpid, m);
  }

  return Array.from(byGrpId.values()).sort((a, b) => b.timestamp - a.timestamp);
}
