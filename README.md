# Withings Health Sync

Sync Withings health data (weight, body composition, and more) for multiple family profiles to local JSON files. Designed to run unattended on a NAS or server via Docker, with automatic token refresh and incremental syncs.

## Features

- **Multi-profile support** -- Authorize each family member's profile separately; sync all of them in a single run
- **Incremental sync** -- First run fetches full history; subsequent runs fetch only new measurements
- **Automatic token refresh** -- OAuth2 refresh tokens are renewed automatically with no re-authentication needed
- **Headless-friendly authorization** -- Authorize from any browser, paste the code into the CLI (no local web server required)
- **Human-readable output** -- Measurement files are named by profile (e.g., `measurements-alice.json`) and contain decoded, human-readable values
- **BMI enrichment** -- Automatically calculates BMI from weight and height when both are available
- **Docker-ready** -- Multi-arch Docker image published to GHCR, with volume mounts for persistent data

## Supported Metrics

| Metric | Key | Unit |
|--------|-----|------|
| Weight | `weight_kg` | kg |
| Height | `height_m` | m |
| Fat-free mass | `fat_free_mass_kg` | kg |
| Fat ratio | `fat_ratio_pct` | % |
| Fat mass | `fat_mass_kg` | kg |
| Muscle mass | `muscle_mass_kg` | kg |
| Hydration | `hydration_kg` | kg |
| Bone mass | `bone_mass_kg` | kg |
| Diastolic BP | `diastolic_bp_mmhg` | mmHg |
| Systolic BP | `systolic_bp_mmhg` | mmHg |
| Heart pulse | `heart_pulse_bpm` | bpm |
| Temperature | `temperature_c` | °C |
| SpO2 | `spo2_pct` | % |
| BMI | `bmi` | kg/m² (calculated) |

## Prerequisites

- **Node.js 20+** (for local development)
- **Withings Developer Account** -- Create an app at [developer.withings.com](https://developer.withings.com) to get a client ID and secret
- **GitHub Pages** (optional) -- For hosting the OAuth callback page

## Setup

### 1. Create a Withings Developer App

1. Go to [developer.withings.com](https://developer.withings.com) and create an application
2. Set the callback URL to your GitHub Pages URL (e.g., `https://yourusername.github.io/withings-health-sync/callback.html`) or any URL where you'll host the callback page
3. Note the **Client ID** and **Client Secret**

### 2. Configure Environment

```bash
cp .env.template .env
```

Edit `.env` with your credentials:

```
WITHINGS_CLIENT_ID=your_client_id
WITHINGS_CLIENT_SECRET=your_client_secret
WITHINGS_CALLBACK_URL=https://yourusername.github.io/withings-health-sync/callback.html
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Authorize Profiles

Run the authorize command once per profile you want to sync:

```bash
npm run authorize
```

This will:
1. Print an authorization URL -- open it in any browser
2. Withings will prompt you to select a profile and grant access
3. You'll be redirected to the callback page which displays an authorization code
4. Copy the code and paste it into the terminal
5. Optionally name the profile (used for the measurement filename)

Repeat for each family member:

```bash
npm run authorize   # select Alice, name it "alice"
npm run authorize   # select Bob, name it "bob"
npm run authorize   # select Carol, name it "carol"
```

### 5. Sync

```bash
npm run sync
```

The first sync fetches all historical data. Subsequent syncs are incremental, fetching only measurements recorded since the last sync.

## Docker

### Using the Pre-built Image

```bash
docker pull ghcr.io/jasonwaters/withings-health-sync:latest
```

### Running with Docker Compose

```yaml
services:
  sync:
    image: ghcr.io/jasonwaters/withings-health-sync:latest
    env_file: .env
    environment:
      - DATA_DIR=/app/data
    volumes:
      - ./data:/app/data
    restart: "no"
```

```bash
# First-time authorization (interactive)
docker compose run sync node dist/authorize.js

# Run a sync
docker compose run sync
```

### Scheduled Syncs

Use cron, systemd timers, or your NAS's task scheduler to run the sync on a schedule:

```bash
# Example cron entry: sync daily at 6 AM
0 6 * * * cd /path/to/withings-health-sync && docker compose run --rm sync
```

## Data Files

All data is stored in the `data/` directory (or `DATA_DIR`):

| File | Description |
|------|-------------|
| `tokens.json` | OAuth tokens for all authorized profiles (keyed by user ID) |
| `measurements-{name}.json` | Decoded measurements for each profile |
| `sync-state.json` | Per-user sync metadata (last update time, record counts) |
| `users.json` | Cached profile list |

### Measurement File Format

Each measurement entry contains:

```json
{
  "grpid": 12345678,
  "date": "2024-11-14T12:34:56.000Z",
  "timestamp": 1731585296,
  "category": 1,
  "attrib": 0,
  "deviceid": "abc123",
  "measures": {
    "weight_kg": 74.188,
    "fat_mass_kg": 13.79,
    "muscle_mass_kg": 57.38,
    "hydration_kg": 41.19,
    "bone_mass_kg": 3.01,
    "bmi": 23.47
  },
  "raw": [...]
}
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WITHINGS_CLIENT_ID` | Yes | Withings developer app client ID |
| `WITHINGS_CLIENT_SECRET` | Yes | Withings developer app client secret |
| `WITHINGS_CALLBACK_URL` | Yes | OAuth callback URL (your hosted callback page) |
| `WITHINGS_USER_IDS` | No | Comma-separated user IDs to sync (empty = all authorized profiles) |
| `DATA_DIR` | No | Directory for data files (default: `./data`) |

## Development

```bash
npm install          # install dependencies
npm test             # run test suite
npm run test:watch   # run tests in watch mode
npm run build        # compile TypeScript to dist/
npm run authorize    # authorize a Withings profile
npm run sync         # run a sync
```

## How It Works

1. **Authorization**: Each profile is authorized individually via the Withings OAuth2 flow. The user opens a URL in their browser, selects a profile, and pastes the resulting authorization code back into the CLI. Each profile gets its own access/refresh token pair stored in `tokens.json`.

2. **Token Refresh**: On each sync, every profile's access token is refreshed via the OAuth2 refresh token grant. This is a server-to-server API call that requires no user interaction and does not trigger MFA/email verification. Refresh tokens are valid for one year and are renewed with each use.

3. **Data Fetching**: Measurements are fetched from the Withings API using each profile's dedicated access token. The API automatically returns data for the profile that was authorized. Pagination is handled automatically.

4. **Incremental Sync**: The `lastupdate` timestamp from the previous sync is used to fetch only new measurements. The raw API values (encoded as `value * 10^unit`) are decoded into human-readable numbers.

5. **BMI Enrichment**: When a profile has both weight and height measurements, BMI is calculated and added to weight entries that don't already have it.

6. **Persistence**: All data is stored as formatted JSON files in the data directory, designed to be mounted as a Docker volume for persistence across container restarts.

## License

ISC
