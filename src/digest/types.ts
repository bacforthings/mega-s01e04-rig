export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  // Every valid event counts as a run, including retries and failures.
  runs: number;
  retries: number;
  // Retain failures even when the job later recovers.
  failures: number;
  lastStatus: DigestStatus;
  // The last error-bearing event, retained after recovery.
  lastError: string | null;
  // Original timestamp strings preserve the log's offsets.
  firstAt: string;
  lastAt: string;
};

export type DigestNight = {
  // One row per job, sorted by job.
  rows: DigestRow[];
  badLines: number;
  // Counts of individual valid events, not jobs or final statuses.
  counts: { ok: number; retry: number; fail: number };
};

// Missing night: null. Empty file: empty rows, zero badLines and counts.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
