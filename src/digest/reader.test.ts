import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from './reader.js';

const night = '2026-10-28';
const event = { at: '2026-10-28T23:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' };
let runsDir: string;

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

function writeEvents(events: unknown[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), events.map((value) => JSON.stringify(value)).join('\n') + '\n');
}

describe('night reader', () => {
  it('reads the supplied night, preserving recovered errors and ownerless jobs', () => {
    const result = readNight('runs', night)!;
    expect(result.badLines).toBe(1);
    expect(result.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(result.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(result.rows[0].owner).toBeNull();
    expect(result.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, failures: 0,
      lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(result.rows[2]).toMatchObject({ runs: 8, retries: 1, failures: 0, lastError: 'lock held' });
    expect(result.rows[3]).toMatchObject({ runs: 1, failures: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('distinguishes missing and empty nights and propagates filesystem errors', () => {
    expect(readNight(runsDir, night)).toBeNull();
    writeFileSync(join(runsDir, `${night}.jsonl`), '');
    expect(readNight(runsDir, night)).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    mkdirSync(join(runsDir, '2026-10-29.jsonl'));
    expect(() => readNight(runsDir, '2026-10-29')).toThrow();
  });

  it('counts malformed JSON, invalid shapes and interior blank lines, but not the final newline', () => {
    const invalid = [null, [], {}, 42, 'text',
      { ...event, job: '' }, { ...event, job: 1 }, { ...event, status: 'pending' },
      { ...event, owner: undefined }, { ...event, owner: false }, { ...event, error: null },
      { ...event, at: 1 }, { ...event, at: 'yesterday' },
    ];
    writeFileSync(join(runsDir, `${night}.jsonl`), [
      JSON.stringify(event), '{broken', '', ...invalid.map((value) => JSON.stringify(value)),
    ].join('\r\n') + '\r\n');
    expect(readNight(runsDir, night)).toMatchObject({ badLines: invalid.length + 2, counts: { ok: 1, retry: 0, fail: 0 } });
    writeFileSync(join(runsDir, `${night}.jsonl`), JSON.stringify(event));
    expect(readNight(runsDir, night)?.badLines).toBe(0);
  });

  it('orders events by their instant, preserves offsets and retains the latest error after recovery', () => {
    writeEvents([
      { ...event, at: '2026-10-29T00:30:00+01:00', owner: null },
      { ...event, at: '2026-10-28T23:15:00Z', status: 'retry', error: 'latest error' },
      { ...event, at: '2026-10-29T00:00:00+02:00', status: 'fail', error: 'earlier error' },
    ]);
    expect(readNight(runsDir, night)).toEqual({
      rows: [{ job: event.job, owner: null, runs: 3, retries: 1, failures: 1,
        lastStatus: 'ok', lastError: 'latest error',
        firstAt: '2026-10-29T00:00:00+02:00', lastAt: '2026-10-29T00:30:00+01:00' }],
      badLines: 0, counts: { ok: 1, retry: 1, fail: 1 },
    });
  });

  it('uses file order for tied timestamps and accepts empty error strings', () => {
    writeEvents([{ ...event, status: 'fail', error: 'old' }, { ...event, owner: null, error: '' }]);
    expect(readNight(runsDir, night)?.rows[0]).toMatchObject({ owner: null, lastStatus: 'ok', lastError: '' });
  });

  it('rejects malformed and impossible nights before accessing their paths', () => {
    writeFileSync(join(runsDir, '2026-02-30.jsonl'), JSON.stringify(event));
    for (const value of ['../2026-10-28', '2026-10-28/../2026-10-28', '2026-10-28.jsonl', '',
      '2026-1-28', '2026-02-30', '2026-02-29', '2026-13-01', '2026-10-28\0']) {
      expect(readNight(runsDir, value)).toBeNull();
    }
    writeFileSync(join(runsDir, '2024-02-29.jsonl'), '');
    expect(readNight(runsDir, '2024-02-29')?.rows).toEqual([]);
  });

  it('requires real, offset-bearing timestamps with valid time components', () => {
    const invalid = ['2026-02-30T23:00:00Z', '2026-10-28T24:00:00Z', '2026-10-28T23:60:00Z',
      '2026-10-28T23:00:60Z', '2026-10-28T23:00:00+24:00', '2026-10-28T23:00:00+01:60',
      '2026-10-28T23:00:00', '2026-10-28'];
    writeEvents([...invalid.map((at) => ({ ...event, at })), { ...event, at: '2024-02-29T23:00:00.125-05:00' }]);
    const result = readNight(runsDir, night)!;
    expect(result.badLines).toBe(invalid.length);
    expect(result.rows[0].firstAt).toBe('2024-02-29T23:00:00.125-05:00');
    expect(result.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });
});
