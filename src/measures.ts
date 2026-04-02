import {
  MEASURE_TYPE_NAMES,
  MeasureType,
  type RawMeasure,
  type RawMeasureGroup,
  type DecodedMeasurement,
} from './types.js';

export function decodeRawValue(raw: RawMeasure): number {
  return raw.value * Math.pow(10, raw.unit);
}

export function calculateBmi(weightKg: number, heightM: number): number {
  if (heightM <= 0) return 0;
  return weightKg / (heightM * heightM);
}

export function decodeMeasureGroup(group: RawMeasureGroup): DecodedMeasurement {
  const measures: Record<string, number> = {};
  let weightKg: number | null = null;
  let heightM: number | null = null;

  for (const raw of group.measures) {
    const decoded = decodeRawValue(raw);
    const name = MEASURE_TYPE_NAMES[raw.type];

    if (name) {
      measures[name] = parseFloat(decoded.toFixed(4));
    }

    if (raw.type === MeasureType.WEIGHT) weightKg = decoded;
    if (raw.type === MeasureType.HEIGHT) heightM = decoded;
  }

  if (weightKg !== null && heightM !== null && heightM > 0) {
    measures.bmi = parseFloat(calculateBmi(weightKg, heightM).toFixed(2));
  }

  return {
    grpid: group.grpid,
    date: new Date(group.date * 1000).toISOString(),
    timestamp: group.date,
    category: group.category,
    attrib: group.attrib,
    deviceid: group.deviceid,
    timezone: group.timezone,
    measures,
    raw: group.measures,
  };
}
