import { describe, it, expect } from 'vitest';
import { decodeRawValue, calculateBmi, decodeMeasureGroup } from '../measures.js';
import { MeasureType, type RawMeasureGroup } from '../types.js';

describe('decodeRawValue', () => {
  it('decodes weight with negative unit exponent', () => {
    expect(decodeRawValue({ value: 74188, type: 1, unit: -3 })).toBeCloseTo(
      74.188,
      3,
    );
  });

  it('decodes value with zero unit', () => {
    expect(decodeRawValue({ value: 130, type: 11, unit: 0 })).toBe(130);
  });

  it('decodes height with negative unit exponent', () => {
    expect(decodeRawValue({ value: 1778, type: 4, unit: -3 })).toBeCloseTo(
      1.778,
      3,
    );
  });

  it('decodes fat ratio percentage', () => {
    expect(decodeRawValue({ value: 1862, type: 6, unit: -2 })).toBeCloseTo(
      18.62,
      2,
    );
  });
});

describe('calculateBmi', () => {
  it('calculates correct BMI', () => {
    const bmi = calculateBmi(74.188, 1.778);
    expect(bmi).toBeCloseTo(23.47, 1);
  });

  it('returns 0 for zero height', () => {
    expect(calculateBmi(74, 0)).toBe(0);
  });

  it('returns 0 for negative height', () => {
    expect(calculateBmi(74, -1)).toBe(0);
  });
});

describe('decodeMeasureGroup', () => {
  it('decodes a complete body composition group', () => {
    const group: RawMeasureGroup = {
      grpid: 12345,
      attrib: 0,
      date: 1774966078,
      created: 1774966116,
      category: 1,
      deviceid: '13045433',
      model: 13,
      measures: [
        { value: 74188, type: MeasureType.WEIGHT, unit: -3, algo: 3, fm: 3 },
        { value: 1379, type: MeasureType.FAT_MASS, unit: -2, algo: 3, fm: 3 },
        { value: 5738, type: MeasureType.MUSCLE_MASS, unit: -2, algo: 3, fm: 3 },
        { value: 4119, type: MeasureType.HYDRATION, unit: -2, algo: 3, fm: 3 },
        { value: 301, type: MeasureType.BONE_MASS, unit: -2, algo: 3, fm: 3 },
      ],
    };

    const decoded = decodeMeasureGroup(group);

    expect(decoded.grpid).toBe(12345);
    expect(decoded.timestamp).toBe(1774966078);
    expect(decoded.measures.weight_kg).toBeCloseTo(74.188, 3);
    expect(decoded.measures.fat_mass_kg).toBeCloseTo(13.79, 2);
    expect(decoded.measures.muscle_mass_kg).toBeCloseTo(57.38, 2);
    expect(decoded.measures.hydration_kg).toBeCloseTo(41.19, 2);
    expect(decoded.measures.bone_mass_kg).toBeCloseTo(3.01, 2);
    expect(decoded.raw).toHaveLength(5);
  });

  it('calculates BMI when weight and height are both present', () => {
    const group: RawMeasureGroup = {
      grpid: 99,
      attrib: 0,
      date: 1700000000,
      created: 1700000000,
      category: 1,
      deviceid: null,
      model: null,
      measures: [
        { value: 74188, type: MeasureType.WEIGHT, unit: -3 },
        { value: 1778, type: MeasureType.HEIGHT, unit: -3 },
      ],
    };

    const decoded = decodeMeasureGroup(group);
    expect(decoded.measures.bmi).toBeCloseTo(23.47, 0);
  });

  it('does not include BMI when height is missing', () => {
    const group: RawMeasureGroup = {
      grpid: 100,
      attrib: 0,
      date: 1700000000,
      created: 1700000000,
      category: 1,
      deviceid: null,
      model: null,
      measures: [
        { value: 74188, type: MeasureType.WEIGHT, unit: -3 },
      ],
    };

    const decoded = decodeMeasureGroup(group);
    expect(decoded.measures.bmi).toBeUndefined();
  });

  it('decodes all known measure types', () => {
    const group: RawMeasureGroup = {
      grpid: 200,
      attrib: 0,
      date: 1700000000,
      created: 1700000000,
      category: 1,
      deviceid: null,
      model: null,
      measures: [
        { value: 74188, type: MeasureType.WEIGHT, unit: -3 },
        { value: 1778, type: MeasureType.HEIGHT, unit: -3 },
        { value: 6039, type: MeasureType.FAT_FREE_MASS, unit: -2 },
        { value: 1862, type: MeasureType.FAT_RATIO, unit: -2 },
        { value: 1379, type: MeasureType.FAT_MASS, unit: -2 },
        { value: 80, type: MeasureType.DIASTOLIC_BP, unit: 0 },
        { value: 120, type: MeasureType.SYSTOLIC_BP, unit: 0 },
        { value: 72, type: MeasureType.HEART_PULSE, unit: 0 },
        { value: 369, type: MeasureType.TEMPERATURE, unit: -1 },
        { value: 97, type: MeasureType.SPO2, unit: 0 },
        { value: 5738, type: MeasureType.MUSCLE_MASS, unit: -2 },
        { value: 4119, type: MeasureType.HYDRATION, unit: -2 },
        { value: 301, type: MeasureType.BONE_MASS, unit: -2 },
      ],
    };

    const decoded = decodeMeasureGroup(group);

    expect(decoded.measures.weight_kg).toBeCloseTo(74.188, 3);
    expect(decoded.measures.height_m).toBeCloseTo(1.778, 3);
    expect(decoded.measures.fat_free_mass_kg).toBeCloseTo(60.39, 2);
    expect(decoded.measures.fat_ratio_pct).toBeCloseTo(18.62, 2);
    expect(decoded.measures.fat_mass_kg).toBeCloseTo(13.79, 2);
    expect(decoded.measures.diastolic_bp_mmhg).toBe(80);
    expect(decoded.measures.systolic_bp_mmhg).toBe(120);
    expect(decoded.measures.heart_pulse_bpm).toBe(72);
    expect(decoded.measures.temperature_c).toBeCloseTo(36.9, 1);
    expect(decoded.measures.spo2_pct).toBe(97);
    expect(decoded.measures.muscle_mass_kg).toBeCloseTo(57.38, 2);
    expect(decoded.measures.hydration_kg).toBeCloseTo(41.19, 2);
    expect(decoded.measures.bone_mass_kg).toBeCloseTo(3.01, 2);
    expect(decoded.measures.bmi).toBeDefined();
  });
});
