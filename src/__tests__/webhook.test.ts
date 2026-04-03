import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendWebhook, getLatestMeasurements, getMeasurementsByLookback, processAndSendWebhook } from '../webhook.js';
import type { DecodedMeasurement, WebhookConfig } from '../types.js';

global.fetch = vi.fn();

describe('webhook', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getMeasurementsByLookback', () => {
    it('filters measurements within lookback time range', () => {
      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - (24 * 60 * 60);
      const threeDaysAgo = now - (3 * 24 * 60 * 60);
      const sevenDaysAgo = now - (7 * 24 * 60 * 60);
      const tenDaysAgo = now - (10 * 24 * 60 * 60);

      const measurements: DecodedMeasurement[] = [
        {
          grpid: 1,
          date: new Date(oneDayAgo * 1000).toISOString(),
          timestamp: oneDayAgo,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 70 },
          raw: [],
        },
        {
          grpid: 2,
          date: new Date(threeDaysAgo * 1000).toISOString(),
          timestamp: threeDaysAgo,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 71 },
          raw: [],
        },
        {
          grpid: 3,
          date: new Date(sevenDaysAgo * 1000).toISOString(),
          timestamp: sevenDaysAgo,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 72 },
          raw: [],
        },
        {
          grpid: 4,
          date: new Date(tenDaysAgo * 1000).toISOString(),
          timestamp: tenDaysAgo,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 73 },
          raw: [],
        },
      ];

      const result = getMeasurementsByLookback(measurements, '7 days');

      expect(result).toHaveLength(3);
      expect(result[0].timestamp).toBe(oneDayAgo);
      expect(result[1].timestamp).toBe(threeDaysAgo);
      expect(result[2].timestamp).toBe(sevenDaysAgo);
    });

    it('supports various time units', () => {
      const now = Math.floor(Date.now() / 1000);
      const oneWeekAgo = now - (7 * 24 * 60 * 60);
      const threeWeeksAgo = now - (21 * 24 * 60 * 60);

      const measurements: DecodedMeasurement[] = [
        {
          grpid: 1,
          date: new Date(oneWeekAgo * 1000).toISOString(),
          timestamp: oneWeekAgo,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 70 },
          raw: [],
        },
        {
          grpid: 2,
          date: new Date(threeWeeksAgo * 1000).toISOString(),
          timestamp: threeWeeksAgo,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 71 },
          raw: [],
        },
      ];

      const result = getMeasurementsByLookback(measurements, '2 weeks');
      expect(result).toHaveLength(1);
      expect(result[0].grpid).toBe(1);
    });

    it('returns empty array if no measurements in range', () => {
      const now = Math.floor(Date.now() / 1000);
      const oneYearAgo = now - (365 * 24 * 60 * 60);

      const measurements: DecodedMeasurement[] = [
        {
          grpid: 1,
          date: new Date(oneYearAgo * 1000).toISOString(),
          timestamp: oneYearAgo,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 70 },
          raw: [],
        },
      ];

      const result = getMeasurementsByLookback(measurements, '7 days');
      expect(result).toHaveLength(0);
    });

    it('throws error for invalid lookbackTime format', () => {
      const measurements: DecodedMeasurement[] = [];

      expect(() => getMeasurementsByLookback(measurements, 'invalid')).toThrow(
        'Invalid lookbackTime format',
      );
      expect(() => getMeasurementsByLookback(measurements, '7')).toThrow(
        'Invalid lookbackTime format',
      );
    });

    it('sorts results by timestamp descending', () => {
      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - (24 * 60 * 60);
      const twoDaysAgo = now - (2 * 24 * 60 * 60);

      const measurements: DecodedMeasurement[] = [
        {
          grpid: 2,
          date: new Date(twoDaysAgo * 1000).toISOString(),
          timestamp: twoDaysAgo,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 71 },
          raw: [],
        },
        {
          grpid: 1,
          date: new Date(oneDayAgo * 1000).toISOString(),
          timestamp: oneDayAgo,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 70 },
          raw: [],
        },
      ];

      const result = getMeasurementsByLookback(measurements, '7 days');

      expect(result[0].timestamp).toBeGreaterThan(result[1].timestamp);
    });
  });

  describe('getLatestMeasurements', () => {
    it('returns N most recent measurements sorted by timestamp', () => {
      const measurements: DecodedMeasurement[] = [
        {
          grpid: 1,
          date: '2026-03-01T10:00:00.000Z',
          timestamp: 1000,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 70 },
          raw: [],
        },
        {
          grpid: 2,
          date: '2026-03-05T10:00:00.000Z',
          timestamp: 2000,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 71 },
          raw: [],
        },
        {
          grpid: 3,
          date: '2026-03-10T10:00:00.000Z',
          timestamp: 3000,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 72 },
          raw: [],
        },
      ];

      const latest = getLatestMeasurements(measurements, 2);

      expect(latest).toHaveLength(2);
      expect(latest[0].timestamp).toBe(3000);
      expect(latest[1].timestamp).toBe(2000);
    });

    it('returns all measurements if count exceeds available', () => {
      const measurements: DecodedMeasurement[] = [
        {
          grpid: 1,
          date: '2026-03-01T10:00:00.000Z',
          timestamp: 1000,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 70 },
          raw: [],
        },
      ];

      const latest = getLatestMeasurements(measurements, 10);

      expect(latest).toHaveLength(1);
    });

    it('returns empty array for empty input', () => {
      const latest = getLatestMeasurements([], 5);
      expect(latest).toEqual([]);
    });
  });

  describe('sendWebhook', () => {
    it('POSTs measurements with profileName in default flat structure', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response);

      const measurements: DecodedMeasurement[] = [
        {
          grpid: 123,
          date: '2026-03-31T14:00:00.000Z',
          timestamp: 1774966000,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          timezone: 'America/Denver',
          measures: { weight_kg: 74.5, bmi: 23.5 },
          raw: [{ value: 74500, type: 1, unit: -3 }],
        },
      ];

      await sendWebhook('https://example.com/webhook', measurements, 'Alice');

      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const sentPayload = JSON.parse(callArgs[1].body);

      expect(sentPayload).toEqual({
        measurements,
        profileName: 'Alice',
      });
    });

    it('POSTs measurements wrapped in payloadKey when specified', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response);

      const measurements: DecodedMeasurement[] = [
        {
          grpid: 123,
          date: '2026-03-31T14:00:00.000Z',
          timestamp: 1774966000,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          timezone: 'America/Denver',
          measures: { weight_kg: 74.5, bmi: 23.5 },
          raw: [{ value: 74500, type: 1, unit: -3 }],
        },
      ];

      await sendWebhook('https://example.com/webhook', measurements, 'Bob', 'merge_variables');

      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const sentPayload = JSON.parse(callArgs[1].body);

      expect(sentPayload).toEqual({
        merge_variables: {
          measurements,
          profileName: 'Bob',
        },
      });
    });

    it('omits profileName if undefined', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response);

      const measurements: DecodedMeasurement[] = [
        {
          grpid: 123,
          date: '2026-03-31T14:00:00.000Z',
          timestamp: 1774966000,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 74.5 },
          raw: [],
        },
      ];

      await sendWebhook('https://example.com/webhook', measurements, undefined);

      const callArgs = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const sentPayload = JSON.parse(callArgs[1].body);

      expect(sentPayload).toEqual({
        measurements,
      });
      expect(sentPayload.profileName).toBeUndefined();
    });

    it('throws error if webhook POST fails', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const measurements: DecodedMeasurement[] = [];

      await expect(
        sendWebhook('https://example.com/webhook', measurements, undefined),
      ).rejects.toThrow('Webhook POST failed: 500 Internal Server Error');
    });
  });

  describe('processAndSendWebhook', () => {
    it('converts kg to lbs when units is imperial', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response);

      const measurements: DecodedMeasurement[] = [
        {
          grpid: 1,
          date: '2026-03-31T14:00:00.000Z',
          timestamp: 1774966000,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 74.5, fat_mass_kg: 13.5 },
          raw: [],
        },
      ];

      const config: WebhookConfig = {
        profileKey: 'test',
        webhookUrl: 'https://example.com/webhook',
        payloadKey: 'merge_variables',
        units: 'imperial',
        count: 1,
      };

      await processAndSendWebhook(config, measurements, 'TestUser');

      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const sentPayload = JSON.parse(callArgs[1].body);

      expect(sentPayload.merge_variables.profileName).toBe('TestUser');
      expect(sentPayload.merge_variables.measurements[0].measures.weight_lbs).toBeCloseTo(164.24, 1);
      expect(sentPayload.merge_variables.measurements[0].measures.fat_mass_lbs).toBeCloseTo(29.76, 1);
      expect(sentPayload.merge_variables.measurements[0].measures.weight_kg).toBeUndefined();
    });

    it('excludes specified keys from payload', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response);

      const measurements: DecodedMeasurement[] = [
        {
          grpid: 1,
          date: '2026-03-31T14:00:00.000Z',
          timestamp: 1774966000,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 74.5, bmi: 23.5 },
          raw: [{ value: 74500, type: 1, unit: -3 }],
        },
      ];

      const config: WebhookConfig = {
        profileKey: 'test',
        webhookUrl: 'https://example.com/webhook',
        excludedKeys: ['deviceid', 'raw', 'bmi'],
        count: 1,
      };

      await processAndSendWebhook(config, measurements, 'TestUser');

      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const sentPayload = JSON.parse(callArgs[1].body);
      const sentMeasurement = sentPayload.measurements[0];

      expect(sentPayload.profileName).toBe('TestUser');
      expect(sentMeasurement.deviceid).toBeUndefined();
      expect(sentMeasurement.raw).toBeUndefined();
      expect(sentMeasurement.measures.bmi).toBeUndefined();
      expect(sentMeasurement.measures.weight_kg).toBe(74.5);
    });

    it('combines imperial conversion and key exclusion', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response);

      const measurements: DecodedMeasurement[] = [
        {
          grpid: 1,
          date: '2026-03-31T14:00:00.000Z',
          timestamp: 1774966000,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 74.5, bmi: 23.5 },
          raw: [{ value: 74500, type: 1, unit: -3 }],
        },
      ];

      const config: WebhookConfig = {
        profileKey: 'test',
        webhookUrl: 'https://example.com/webhook',
        payloadKey: 'merge_variables',
        units: 'imperial',
        excludedKeys: ['deviceid', 'raw'],
        count: 1,
      };

      await processAndSendWebhook(config, measurements, 'TestUser');

      expect(mockFetch).toHaveBeenCalledOnce();
      const callArgs = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const sentPayload = JSON.parse(callArgs[1].body);
      const sentMeasurement = sentPayload.merge_variables.measurements[0];

      expect(sentPayload.merge_variables.profileName).toBe('TestUser');
      expect(sentMeasurement.measures.weight_lbs).toBeCloseTo(164.24, 1);
      expect(sentMeasurement.measures.weight_kg).toBeUndefined();
      expect(sentMeasurement.deviceid).toBeUndefined();
      expect(sentMeasurement.raw).toBeUndefined();
      expect(sentMeasurement.measures.bmi).toBe(23.5);
    });

    it('uses default count of 3 when not specified', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response);

      const measurements: DecodedMeasurement[] = Array.from({ length: 10 }, (_, i) => ({
        grpid: i,
        date: '2026-03-31T14:00:00.000Z',
        timestamp: 1774966000 + i,
        category: 1,
        attrib: 0,
        deviceid: 'device1',
        measures: { weight_kg: 74.5 },
        raw: [],
      }));

      const config: WebhookConfig = {
        profileKey: 'test',
        webhookUrl: 'https://example.com/webhook',
      };

      await processAndSendWebhook(config, measurements, 'TestUser');

      const callArgs = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const sentPayload = JSON.parse(callArgs[1].body);

      expect(sentPayload.measurements).toHaveLength(3);
      expect(sentPayload.profileName).toBe('TestUser');
    });

    it('keeps metric units by default', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response);

      const measurements: DecodedMeasurement[] = [
        {
          grpid: 1,
          date: '2026-03-31T14:00:00.000Z',
          timestamp: 1774966000,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 74.5 },
          raw: [],
        },
      ];

      const config: WebhookConfig = {
        profileKey: 'test',
        webhookUrl: 'https://example.com/webhook',
        count: 1,
      };

      await processAndSendWebhook(config, measurements, 'TestUser');

      const callArgs = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const sentPayload = JSON.parse(callArgs[1].body);

      expect(sentPayload.profileName).toBe('TestUser');
      expect(sentPayload.measurements[0].measures.weight_kg).toBe(74.5);
      expect(sentPayload.measurements[0].measures.weight_lbs).toBeUndefined();
    });

    it('uses lookbackTime when specified (takes precedence over count)', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response);

      const now = Math.floor(Date.now() / 1000);
      const twoDaysAgo = now - (2 * 24 * 60 * 60);
      const fiveDaysAgo = now - (5 * 24 * 60 * 60);
      const tenDaysAgo = now - (10 * 24 * 60 * 60);

      const measurements: DecodedMeasurement[] = [
        {
          grpid: 1,
          date: new Date(twoDaysAgo * 1000).toISOString(),
          timestamp: twoDaysAgo,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 74.5 },
          raw: [],
        },
        {
          grpid: 2,
          date: new Date(fiveDaysAgo * 1000).toISOString(),
          timestamp: fiveDaysAgo,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 73.5 },
          raw: [],
        },
        {
          grpid: 3,
          date: new Date(tenDaysAgo * 1000).toISOString(),
          timestamp: tenDaysAgo,
          category: 1,
          attrib: 0,
          deviceid: 'device1',
          measures: { weight_kg: 72.5 },
          raw: [],
        },
      ];

      const config: WebhookConfig = {
        profileKey: 'test',
        webhookUrl: 'https://example.com/webhook',
        lookbackTime: '7 days',
        count: 1,
      };

      await processAndSendWebhook(config, measurements, 'TestUser');

      const callArgs = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const sentPayload = JSON.parse(callArgs[1].body);

      expect(sentPayload.measurements).toHaveLength(2);
      expect(sentPayload.measurements[0].timestamp).toBe(twoDaysAgo);
      expect(sentPayload.measurements[1].timestamp).toBe(fiveDaysAgo);
    });
  });
});
