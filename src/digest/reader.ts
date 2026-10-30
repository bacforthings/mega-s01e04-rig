import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function isNight(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function isEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return typeof event.at === 'string'
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(event.at)
    && isNight(event.at.slice(0, 10))
    && Number.isFinite(Date.parse(event.at))
    && typeof event.job === 'string' && event.job.trim().length > 0
    && (event.status === 'ok' || event.status === 'retry' || event.status === 'fail')
    && (typeof event.owner === 'string' || event.owner === null)
    && (!('error' in event) || typeof event.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;
  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const events: RunEvent[] = [];
  let badLines = 0;
  const lines = contents === '' ? [] : contents.split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }
    if (isEvent(event)) events.push(event);
    else badLines++;
  }

  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const rows = new Map<string, DigestRow>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  for (const event of events) {
    counts[event.status]++;
    let row = rows.get(event.job);
    if (!row) {
      row = {
        job: event.job, owner: event.owner, runs: 0, retries: 0, failures: 0,
        lastStatus: event.status, lastError: null, firstAt: event.at, lastAt: event.at,
      };
      rows.set(event.job, row);
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (event.status === 'fail') row.failures++;
    row.owner = event.owner;
    row.lastStatus = event.status;
    row.lastAt = event.at;
    if (event.error !== undefined) row.lastError = event.error;
  }
  return {
    rows: [...rows.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0),
    badLines,
    counts,
  };
};
