export enum MeasureType {
  WEIGHT = 1,
  HEIGHT = 4,
  FAT_FREE_MASS = 5,
  FAT_RATIO = 6,
  FAT_MASS = 8,
  DIASTOLIC_BP = 9,
  SYSTOLIC_BP = 10,
  HEART_PULSE = 11,
  TEMPERATURE = 12,
  SPO2 = 54,
  MUSCLE_MASS = 76,
  HYDRATION = 77,
  BONE_MASS = 88,
}

export const MEASURE_TYPE_NAMES: Record<number, string> = {
  [MeasureType.WEIGHT]: 'weight_kg',
  [MeasureType.HEIGHT]: 'height_m',
  [MeasureType.FAT_FREE_MASS]: 'fat_free_mass_kg',
  [MeasureType.FAT_RATIO]: 'fat_ratio_pct',
  [MeasureType.FAT_MASS]: 'fat_mass_kg',
  [MeasureType.DIASTOLIC_BP]: 'diastolic_bp_mmhg',
  [MeasureType.SYSTOLIC_BP]: 'systolic_bp_mmhg',
  [MeasureType.HEART_PULSE]: 'heart_pulse_bpm',
  [MeasureType.TEMPERATURE]: 'temperature_c',
  [MeasureType.SPO2]: 'spo2_pct',
  [MeasureType.MUSCLE_MASS]: 'muscle_mass_kg',
  [MeasureType.HYDRATION]: 'hydration_kg',
  [MeasureType.BONE_MASS]: 'bone_mass_kg',
};

export const BODY_MEASURE_TYPES = [
  MeasureType.WEIGHT,
  MeasureType.FAT_FREE_MASS,
  MeasureType.FAT_RATIO,
  MeasureType.FAT_MASS,
  MeasureType.MUSCLE_MASS,
  MeasureType.HYDRATION,
  MeasureType.BONE_MASS,
  MeasureType.HEIGHT,
  MeasureType.DIASTOLIC_BP,
  MeasureType.SYSTOLIC_BP,
  MeasureType.HEART_PULSE,
  MeasureType.TEMPERATURE,
  MeasureType.SPO2,
];

export interface RawMeasure {
  value: number;
  type: number;
  unit: number;
  algo?: number;
  fm?: number;
}

export interface RawMeasureGroup {
  grpid: number;
  attrib: number;
  date: number;
  created: number;
  category: number;
  deviceid: string | null;
  model: number | null;
  measures: RawMeasure[];
  timezone?: string;
}

export interface WithingsApiResponse<T = unknown> {
  status: number;
  error?: string;
  body: T;
}

export interface GetMeasBody {
  updatetime: number;
  timezone?: string;
  measuregrps: RawMeasureGroup[];
  more?: number;
  offset?: number;
}

export interface TokenResponse {
  status: number;
  error?: string;
  body: {
    access_token: string;
    refresh_token: string;
    userid: number;
    expires_in: number;
    scope: string;
    token_type: string;
  };
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  userId: number;
  expiresAt?: number;
  profileName?: string;
}

export type TokenStore = Record<string, Tokens>;

export interface UserProfile {
  userid: number;
  firstname: string;
  lastname: string;
}

export interface DecodedMeasurement {
  grpid: number;
  date: string;
  timestamp: number;
  category: number;
  attrib: number;
  deviceid: string | null;
  timezone?: string;
  measures: Record<string, number>;
  raw: RawMeasure[];
}

export interface UserSyncState {
  name: string;
  lastUpdate: number;
  lastSyncAt: string;
  totalRecords: number;
  oldestRecord: string | null;
  newestRecord: string | null;
}

export interface SyncState {
  users: Record<string, UserSyncState>;
}

export interface WithingsConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  apiEndpoint: string;
  userIds?: number[];
  dataDir: string;
  webhooks?: WebhookConfig[];
}

export interface WebhookConfig {
  profileKey: string;
  webhookUrl: string;
  units?: 'metric' | 'imperial';
  count?: number;
  lookbackTime?: string;
  excludedKeys?: string[];
  payloadKey?: string;
}
