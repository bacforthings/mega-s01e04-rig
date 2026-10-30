import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

const originalLaneMarker = process.env.LANE_MARKER;
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };
const directories: string[] = [];

function makeRunsDir(files: Record<string, string>) {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  directories.push(runsDir);
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(runsDir, name), contents);
  return runsDir;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  if (originalLaneMarker === undefined) delete process.env.LANE_MARKER;
  else process.env.LANE_MARKER = originalLaneMarker;
});

describe('digest routes', () => {
  it('renders and returns the same ordered digest, retaining valid rows around bad lines', async () => {
    const job = '<img src=x onerror=alert(1)>';
    const runsDir = makeRunsDir({
      '2026-10-28.jsonl': [
        JSON.stringify({ at: '2026-10-28T08:00:00+02:00', job, status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-28T08:01:00+02:00', job, status: 'retry', owner: null }),
        '{bad json',
        JSON.stringify({ at: '2026-10-28T08:02:00+02:00', job, status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-28T08:03:00+02:00', job, status: 'fail', owner: null, error: '<script>error</script>' }),
        JSON.stringify({ at: '2026-10-28T09:04:00-05:00', job, status: 'ok', owner: null }),
        JSON.stringify({ at: '2026-10-28T10:00:00+01:00', job: 'zeta', status: 'ok', owner: 'ops' }),
        JSON.stringify({ at: '2026-10-28T10:01:00+01:00', job: 'ignored', status: 'unknown', owner: null }),
      ].join('\n'),
    });
    const app = createApp({ ...config, runsDir });

    const page = await app.request('/digest/2026-10-28');
    const html = await page.text();
    const api = await app.request('/api/digest/2026-10-28');
    const digest = await api.json();

    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(digest).toEqual({
      rows: [
        {
          job,
          owner: null,
          runs: 5,
          retries: 3,
          failures: 1,
          lastStatus: 'ok',
          lastError: '<script>error</script>',
          firstAt: '2026-10-28T08:00:00+02:00',
          lastAt: '2026-10-28T09:04:00-05:00',
        },
        {
          job: 'zeta',
          owner: 'ops',
          runs: 1,
          retries: 0,
          failures: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T10:00:00+01:00',
          lastAt: '2026-10-28T10:00:00+01:00',
        },
      ],
      badLines: 2,
      counts: { ok: 2, retry: 3, fail: 1 },
    });
    expect(html.indexOf('&lt;img')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('zeta')).toBeGreaterThan(html.indexOf('&lt;img'));
    expect(html).toContain('—');
    expect(html).toContain('3 (high retries)');
    expect(html).toContain('1 (failed)');
    expect(html).toContain('<td>ok</td>');
    expect(html).toContain('2026-10-28T08:00:00+02:00');
    expect(html).toContain('2026-10-28T09:04:00-05:00');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;error&lt;/script&gt;');
    expect(html).not.toContain(job);
    expect(html).not.toContain('<script>error</script>');
  });

  it('returns 404 for a night without a file', async () => {
    const app = createApp({ ...config, runsDir: makeRunsDir({}) });

    expect((await app.request('/digest/2026-10-29')).status).toBe(404);
    expect((await app.request('/api/digest/2026-10-29')).status).toBe(404);
  });

  it('renders an empty file as nothing ran and returns an empty digest', async () => {
    const app = createApp({ ...config, runsDir: makeRunsDir({ '2026-10-28.jsonl': '' }) });

    const page = await app.request('/digest/2026-10-28');
    const html = await page.text();
    const api = await app.request('/api/digest/2026-10-28');

    expect(page.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });
});
