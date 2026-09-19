// mocks/driver-report/src/app/boot.tsx
/** BootGate (I-10, §7.7): nothing renders until the server sits at a beat.
 *
 *  Embedded — an iframe of the stage, `inherit() !== null` — the stage owns the one server and every «Такт» reloads the
 *  four iframes, so a gate that rebuilt would reset the stage's server to beat 2 or 10 four times over. It NEVER calls
 *  `ensureBooted`: it waits for the stage's rebuild and renders once `server.ui.beat !== null`.
 *
 *  Standalone (`?profile=driver`, `?profile=dispatcher`) it builds its own server at `?beat`, else `defaultBeat`. A page
 *  test's `atBeat(n)` has already set `ui.beat`, so the gate renders at once and never rebuilds under it. While it waits
 *  it renders nothing (the stage frame shows its own bezel). */
import { useEffect, useState, type ReactNode } from 'react';
import { inherit, server } from '../api/server';
import { ensureBooted } from '../stage/runner';
import { urlBeat } from './device';

/** Runs `cleanup` once: on the returned call (an effect's cleanup) or at `pagehide`, whichever comes first — a listener
 *  this realm leaves on a parent-realm server must not outlive the iframe (the realm rule of live.ts). */
function untilPagehide(cleanup: () => void): () => void {
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    window.removeEventListener('pagehide', run);
    cleanup();
  };
  window.addEventListener('pagehide', run);
  return run;
}

export function BootGate({ defaultBeat, children }: { defaultBeat: number; children: ReactNode }) {
  const [ready, setReady] = useState(() => server.ui.beat !== null);

  useEffect(() => {
    if (ready) return undefined;
    if (inherit() !== null) {
      const check = (): void => { if (server.ui.beat !== null) setReady(true); };
      const off = untilPagehide(server.subscribe(check));
      check();
      return off;
    }
    let live = true;
    void ensureBooted(urlBeat(defaultBeat)).then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [ready, defaultBeat]);

  return ready ? <>{children}</> : <></>;
}
