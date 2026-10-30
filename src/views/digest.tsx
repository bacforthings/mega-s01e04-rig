import type { DigestNight } from '../digest/types.js';

export function DigestPage({ night, digest }: { night: string; digest: DigestNight }) {
  return (
    <>
      <h1>digest · {night}</h1>
      <p>{digest.badLines} bad {digest.badLines === 1 ? 'line' : 'lines'}</p>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <div class="table-wrap" role="region" aria-label="Digest results" tabindex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">job</th>
                <th scope="col">owner</th>
                <th scope="col">runs</th>
                <th scope="col">retries</th>
                <th scope="col">failures</th>
                <th scope="col">last status</th>
                <th scope="col">last error</th>
                <th scope="col">first time</th>
                <th scope="col">last time</th>
              </tr>
            </thead>
            <tbody>
              {digest.rows.map((row) => (
                <tr>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries >= 3 ? <span class="warn">{row.retries} (high retries)</span> : row.retries}</td>
                  <td>{row.failures > 0 ? <span class="warn">{row.failures} (failed)</span> : row.failures}</td>
                  <td>{row.lastStatus === 'fail' ? <span class="warn">{row.lastStatus} (failed)</span> : row.lastStatus}</td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
