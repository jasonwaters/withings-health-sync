import type {
  WithingsConfig,
  Tokens,
  TokenResponse,
  WithingsApiResponse,
  GetMeasBody,
  RawMeasureGroup,
} from './types.js';
import type { Storage } from './storage.js';

const TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';
const AUTHORIZE_URL = 'https://account.withings.com/oauth2_user/authorize2';

const ACCESS_TOKEN_BUFFER_MS = 30 * 60 * 1000;

interface MeasureOptions {
  meastypes?: number[];
  lastupdate?: number;
  startdate?: number;
  enddate?: number;
  category?: number;
}

export class WithingsClient {
  private config: WithingsConfig;
  private storage: Storage;
  private tokens: Tokens;

  constructor(config: WithingsConfig, storage: Storage, tokens: Tokens) {
    this.config = config;
    this.storage = storage;
    this.tokens = tokens;
  }

  get userId(): number {
    return this.tokens.userId;
  }

  static getAuthorizationUrl(config: WithingsConfig): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      scope: 'user.metrics',
      state: 'withings-health-sync',
    });
    return `${AUTHORIZE_URL}?${params}`;
  }

  static async exchangeCodeForToken(
    config: WithingsConfig,
    storage: Storage,
    code: string,
  ): Promise<Tokens> {
    const body = new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl,
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = (await response.json()) as TokenResponse;

    if (data.status !== 0) {
      throw new Error(
        `Token exchange failed: ${data.error ?? `status ${data.status}`}`,
      );
    }

    const tokens: Tokens = {
      accessToken: data.body.access_token,
      refreshToken: data.body.refresh_token,
      userId: data.body.userid,
      expiresAt: Date.now() + data.body.expires_in * 1000,
    };

    await storage.saveUserTokens(tokens.userId, tokens);
    return tokens;
  }

  async refreshAccessToken(): Promise<void> {
    const body = new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.tokens.refreshToken,
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = (await response.json()) as TokenResponse;

    if (data.status !== 0) {
      throw new Error(
        `Token refresh failed (userid ${this.tokens.userId}): ${data.error ?? `status ${data.status}`}. You may need to re-run: npm run authorize`,
      );
    }

    this.tokens = {
      accessToken: data.body.access_token,
      refreshToken: data.body.refresh_token,
      userId: data.body.userid,
      expiresAt: Date.now() + data.body.expires_in * 1000,
      profileName: this.tokens.profileName,
    };

    await this.storage.saveUserTokens(this.tokens.userId, this.tokens);
  }

  private async getValidAccessToken(): Promise<string> {
    const isExpired =
      this.tokens.expiresAt &&
      Date.now() > this.tokens.expiresAt - ACCESS_TOKEN_BUFFER_MS;

    if (isExpired) {
      await this.refreshAccessToken();
    }

    return this.tokens.accessToken;
  }

  async getMeasures(options: MeasureOptions = {}): Promise<{
    measureGroups: RawMeasureGroup[];
    updatetime: number;
  }> {
    const allGroups: RawMeasureGroup[] = [];
    let latestUpdatetime = 0;
    let offset: number | undefined;
    let hasMore = true;

    while (hasMore) {
      const accessToken = await this.getValidAccessToken();
      const params: Record<string, string> = { action: 'getmeas' };

      if (options.meastypes?.length) {
        params.meastypes = options.meastypes.join(',');
      }
      if (options.lastupdate !== undefined) {
        params.lastupdate = String(options.lastupdate);
      }
      if (options.startdate !== undefined) {
        params.startdate = String(options.startdate);
      }
      if (options.enddate !== undefined) {
        params.enddate = String(options.enddate);
      }
      if (options.category !== undefined) {
        params.category = String(options.category);
      }
      if (offset !== undefined) {
        params.offset = String(offset);
      }

      const body = new URLSearchParams(params);
      const response = await fetch(
        `${this.config.apiEndpoint}/measure`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Bearer ${accessToken}`,
          },
          body: body.toString(),
        },
      );

      const data =
        (await response.json()) as WithingsApiResponse<GetMeasBody>;

      if (data.status !== 0) {
        throw new Error(
          `getmeas failed: ${data.error ?? `status ${data.status}`}`,
        );
      }

      allGroups.push(...data.body.measuregrps);

      if (data.body.updatetime > latestUpdatetime) {
        latestUpdatetime = data.body.updatetime;
      }

      if (data.body.more === 1 && data.body.offset !== undefined) {
        offset = data.body.offset;
      } else {
        hasMore = false;
      }
    }

    return { measureGroups: allGroups, updatetime: latestUpdatetime };
  }
}
