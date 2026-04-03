import dayjs from 'dayjs';
import type { DecodedMeasurement, WebhookConfig } from './types.js';

const KG_TO_LBS = 2.20462;
const METRIC_TO_IMPERIAL_KEYS: Record<string, string> = {
  weight_kg: 'weight_lbs',
  fat_mass_kg: 'fat_mass_lbs',
  muscle_mass_kg: 'muscle_mass_lbs',
  hydration_kg: 'hydration_lbs',
  bone_mass_kg: 'bone_mass_lbs',
  fat_free_mass_kg: 'fat_free_mass_lbs',
};

function convertToImperial(
  measurement: DecodedMeasurement,
): DecodedMeasurement {
  const converted = { ...measurement };
  const newMeasures: Record<string, number> = {};

  for (const [key, value] of Object.entries(measurement.measures)) {
    if (key in METRIC_TO_IMPERIAL_KEYS) {
      const imperialKey = METRIC_TO_IMPERIAL_KEYS[key];
      newMeasures[imperialKey] = parseFloat((value * KG_TO_LBS).toFixed(2));
    } else {
      newMeasures[key] = value;
    }
  }

  converted.measures = newMeasures;
  return converted;
}

function removeKeys(obj: unknown, keysToRemove: string[]): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => removeKeys(item, keysToRemove));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!keysToRemove.includes(key)) {
      result[key] = removeKeys(value, keysToRemove);
    }
  }
  return result;
}

function prepareWebhookMeasurements(
  measurements: DecodedMeasurement[],
  config: WebhookConfig,
): DecodedMeasurement[] {
  let processed = measurements;

  if (config.units === 'imperial') {
    processed = processed.map(convertToImperial);
  }

  if (config.excludedKeys && config.excludedKeys.length > 0) {
    processed = removeKeys(processed, config.excludedKeys) as DecodedMeasurement[];
  }

  return processed;
}

function buildPayload(
  measurements: DecodedMeasurement[],
  profileName: string | undefined,
  payloadKey?: string,
): Record<string, unknown> {
  const data = {
    measurements,
    ...(profileName && { profileName }),
  };

  if (payloadKey) {
    return {
      [payloadKey]: data,
    };
  }
  return data;
}

export async function sendWebhook(
  url: string,
  measurements: DecodedMeasurement[],
  profileName: string | undefined,
  payloadKey?: string,
): Promise<void> {
  const payload = buildPayload(measurements, profileName, payloadKey);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'withings-health-sync',
      Accept: '*/*',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Webhook POST failed: ${response.status} ${response.statusText}`,
    );
  }
}

export function getLatestMeasurements(
  allMeasurements: DecodedMeasurement[],
  count: number,
): DecodedMeasurement[] {
  return allMeasurements
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, count);
}

export function getMeasurementsByLookback(
  allMeasurements: DecodedMeasurement[],
  lookbackTime: string,
): DecodedMeasurement[] {
  const match = lookbackTime.match(/^(\d+)\s*(\w+)$/);
  if (!match) {
    throw new Error(`Invalid lookbackTime format: "${lookbackTime}". Expected format: "7 days", "2 months", "1 year"`);
  }

  const [, amount, unit] = match;
  const amountNum = parseInt(amount, 10);
  
  const cutoffTime = dayjs().subtract(amountNum, unit as dayjs.ManipulateType);
  const cutoffTimestamp = cutoffTime.unix();

  return allMeasurements
    .filter((m) => m.timestamp >= cutoffTimestamp)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function processAndSendWebhook(
  webhookConfig: WebhookConfig,
  allMeasurements: DecodedMeasurement[],
  profileName?: string,
): Promise<void> {
  let selectedMeasurements: DecodedMeasurement[];

  if (webhookConfig.lookbackTime) {
    selectedMeasurements = getMeasurementsByLookback(allMeasurements, webhookConfig.lookbackTime);
  } else {
    const count = webhookConfig.count ?? 3;
    selectedMeasurements = getLatestMeasurements(allMeasurements, count);
  }

  const processed = prepareWebhookMeasurements(selectedMeasurements, webhookConfig);
  await sendWebhook(webhookConfig.webhookUrl, processed, profileName, webhookConfig.payloadKey);
}
