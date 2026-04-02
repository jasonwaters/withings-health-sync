import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WithingsClient } from '../withings-client.js';
import { Storage } from '../storage.js';
import type { WithingsConfig, Tokens } from '../types.js';

const TEST_USER_ID = 1000001;

function makeConfig(overrides: Partial<WithingsConfig> = {}): WithingsConfig {
  return {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    callbackUrl: 'https://example.com/callback',
    apiEndpoint: 'https://wbsapi.withings.net',
    dataDir: '/tmp/whsync-test',
    ...overrides,
  };
}

function makeTokens(overrides: Partial<Tokens> = {}): Tokens {
  return {
    accessToken: 'valid-token',
    refreshToken: 'valid-refresh',
    userId: TEST_USER_ID,
    expiresAt: Date.now() + 10800000,
    ...overrides,
  };
}

describe('WithingsClient', () => {
  let config: WithingsConfig;
  let storage: Storage;

  beforeEach(() => {
    config = makeConfig();
    storage = new Storage(config.dataDir);
  });

  describe('getAuthorizationUrl', () => {
    it('builds correct authorization URL', () => {
      const url = WithingsClient.getAuthorizationUrl(config);

      expect(url).toContain(
        'https://account.withings.com/oauth2_user/authorize2',
      );
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain(
        'redirect_uri=https%3A%2F%2Fexample.com%2Fcallback',
      );
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=user.metrics');
      expect(url).toContain('state=withings-health-sync');
    });

    it('uses configured callback URL', () => {
      const custom = makeConfig({
        callbackUrl: 'https://example.github.io/withings-health-sync/callback.html',
      });
      const url = WithingsClient.getAuthorizationUrl(custom);

      expect(url).toContain(encodeURIComponent(custom.callbackUrl));
    });
  });

  describe('exchangeCodeForToken', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('exchanges code for tokens and saves them per user', async () => {
      const mockTokenResponse = {
        status: 0,
        body: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          userid: TEST_USER_ID,
          expires_in: 10800,
          scope: 'user.metrics',
          token_type: 'Bearer',
        },
      };

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: () => Promise.resolve(mockTokenResponse),
      } as Response);

      vi.spyOn(storage, 'saveUserTokens').mockResolvedValueOnce();

      const tokens = await WithingsClient.exchangeCodeForToken(
        config,
        storage,
        'auth-code-123',
      );

      expect(tokens.accessToken).toBe('new-access-token');
      expect(tokens.refreshToken).toBe('new-refresh-token');
      expect(tokens.userId).toBe(TEST_USER_ID);
      expect(storage.saveUserTokens).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ accessToken: 'new-access-token' }),
      );
    });

    it('throws on failed token exchange', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: 503,
            error: 'Invalid code',
          }),
      } as Response);

      await expect(
        WithingsClient.exchangeCodeForToken(config, storage, 'bad-code'),
      ).rejects.toThrow('Token exchange failed');
    });
  });

  describe('refreshAccessToken', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('refreshes and saves new tokens for the user', async () => {
      const tokens = makeTokens({ expiresAt: Date.now() - 1000 });
      const client = new WithingsClient(config, storage, tokens);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: 0,
            body: {
              access_token: 'refreshed-access',
              refresh_token: 'refreshed-refresh',
              userid: TEST_USER_ID,
              expires_in: 10800,
              scope: 'user.metrics',
              token_type: 'Bearer',
            },
          }),
      } as Response);

      vi.spyOn(storage, 'saveUserTokens').mockResolvedValueOnce();

      await client.refreshAccessToken();

      expect(storage.saveUserTokens).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({
          accessToken: 'refreshed-access',
          refreshToken: 'refreshed-refresh',
        }),
      );
    });

    it('throws on API error and suggests re-authorization', async () => {
      const tokens = makeTokens({ refreshToken: 'expired-refresh' });
      const client = new WithingsClient(config, storage, tokens);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: 401,
            error: 'Invalid refresh token',
          }),
      } as Response);

      await expect(client.refreshAccessToken()).rejects.toThrow(
        'npm run authorize',
      );
    });

    it('preserves profileName through refresh', async () => {
      const tokens = makeTokens({
        profileName: 'alice',
        expiresAt: Date.now() - 1000,
      });
      const client = new WithingsClient(config, storage, tokens);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: 0,
            body: {
              access_token: 'new-access',
              refresh_token: 'new-refresh',
              userid: TEST_USER_ID,
              expires_in: 10800,
              scope: 'user.metrics',
              token_type: 'Bearer',
            },
          }),
      } as Response);

      vi.spyOn(storage, 'saveUserTokens').mockResolvedValueOnce();

      await client.refreshAccessToken();

      expect(storage.saveUserTokens).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({ profileName: 'alice' }),
      );
    });
  });

  describe('getMeasures', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('fetches measures with pagination', async () => {
      const tokens = makeTokens();
      const client = new WithingsClient(config, storage, tokens);

      const page1 = {
        status: 0,
        body: {
          updatetime: 1700000000,
          measuregrps: [
            {
              grpid: 1,
              attrib: 0,
              date: 1700000000,
              created: 1700000000,
              category: 1,
              deviceid: null,
              model: null,
              measures: [{ value: 74000, type: 1, unit: -3 }],
            },
          ],
          more: 1,
          offset: 50,
        },
      };

      const page2 = {
        status: 0,
        body: {
          updatetime: 1700000000,
          measuregrps: [
            {
              grpid: 2,
              attrib: 0,
              date: 1699000000,
              created: 1699000000,
              category: 1,
              deviceid: null,
              model: null,
              measures: [{ value: 73500, type: 1, unit: -3 }],
            },
          ],
          more: 0,
        },
      };

      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          json: () => Promise.resolve(page1),
        } as Response)
        .mockResolvedValueOnce({
          json: () => Promise.resolve(page2),
        } as Response);

      const result = await client.getMeasures();

      expect(result.measureGroups).toHaveLength(2);
      expect(result.measureGroups[0].grpid).toBe(1);
      expect(result.measureGroups[1].grpid).toBe(2);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('passes lastupdate for incremental sync', async () => {
      const tokens = makeTokens();
      const client = new WithingsClient(config, storage, tokens);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: 0,
            body: { updatetime: 1700000001, measuregrps: [] },
          }),
      } as Response);

      await client.getMeasures({ lastupdate: 1700000000 });

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = fetchCall[1]?.body as string;
      expect(body).toContain('lastupdate=1700000000');
    });

    it('does not send userid param (token scopes to profile)', async () => {
      const tokens = makeTokens();
      const client = new WithingsClient(config, storage, tokens);

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: 0,
            body: { updatetime: 1700000001, measuregrps: [] },
          }),
      } as Response);

      await client.getMeasures();

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = fetchCall[1]?.body as string;
      expect(body).not.toContain('userid');
    });
  });
});
