// mocks/driver-report/src/stage/keys.ts
/** The presenter's keyboard (§5.10, I-13). «P» hide or show the bar · «F» cycle focus · «1» phone · «2» console ·
 *  «3» both · «T» «Такт ▾» · «R» «Перемотати до…» · Esc close a menu.
 *
 *  IT HAS TO WORK FROM INSIDE A PANE, and that is the whole reason this module exists. The presenter's last click
 *  was on the phone or on the console — both are iframes, and a `keydown` there never reaches the stage document.
 *  So each pane installs `forwardStageKeys()` and re-emits the eight keys on the SHARED server (§7.7), which the
 *  stage is already listening to. Nothing else crosses: the pane sends a key name, never a DOM event, so no object
 *  from a pane's realm is ever held by the stage.
 *
 *  KEYS ARE READ FROM `code` FIRST. `key` is what the LAYOUT produces, and a presenter demoing a Ukrainian product
 *  is very likely holding a Ukrainian layout, where the «P» key types «з». `code` is the physical key and does not
 *  move; `key` is kept as the fallback for Escape and for anything that reports no code.
 *
 *  A key pressed inside a text field is a key the presenter is typing, never a command: «Р» must reach the office's
 *  four-digit time input, and «1» its odometer. */
import { useEffect, useRef } from 'react';
import { server } from '../api/server';

/** The eight of §5.10, in the spelling `useStageKeys`' handler map is keyed by. */
export const STAGE_KEYS = ['p', 'f', '1', '2', '3', 't', 'r', 'Escape'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

/** The physical keys, layout-independent (see the header). */
const BY_CODE: Record<string, StageKey> = { KeyP: 'p', KeyF: 'f', KeyT: 't', KeyR: 'r', Digit1: '1', Digit2: '2',
  Digit3: '3', Numpad1: '1', Numpad2: '2', Numpad3: '3', Escape: 'Escape' };

/** Anything a keystroke could be meant for rather than for the stage. `[contenteditable="false"]` is explicitly
 *  NOT editable and is excluded, or a whole subtree marked uneditable would swallow every command inside it. */
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** Duck-typed rather than `instanceof Element`: on the stage this runs against nodes from a pane's own realm, where
 *  every `instanceof` against this realm's constructors is false (§7.7). */
function inEditable(target: EventTarget | null): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null;
  if (el === null || typeof el.closest !== 'function') return false;
  return el.closest(EDITABLE) !== null;
}

/** The stage key this event is, or null — for a modifier combination (Ctrl+R is a reload, not a rewind), for a key
 *  the stage does not claim, and for a key aimed at a text field. */
export function stageKeyOf(e: KeyboardEvent): StageKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey || inEditable(e.target)) return null;
  const byCode = BY_CODE[e.code];
  if (byCode !== undefined) return byCode;
  const spelled = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return (STAGE_KEYS as readonly string[]).includes(spelled) ? (spelled as StageKey) : null;
}

/** THE PANE SIDE. Mounted by each shell while `IS_STAGE`: a keystroke in the phone or the console becomes a
 *  `stage-key` event on the shared server. Returns the stopper. */
export function forwardStageKeys(): () => void {
  const onKey = (e: KeyboardEvent): void => {
    const key = stageKeyOf(e);
    if (key !== null) server.emit({ type: 'stage-key', key });
  };
  document.addEventListener('keydown', onKey);
  return () => { document.removeEventListener('keydown', onKey); };
}

/** THE STAGE SIDE. Its own `keydown` plus the keys the panes forward, dispatched through one map so the two routes
 *  can never drift. `handlers` is read through a ref: the stage page rebuilds the map on every render and a
 *  subscription that churned with it would drop keys pressed between renders. */
export function useStageKeys(handlers: Record<string, () => void>): void {
  const current = useRef(handlers);
  current.current = handlers;
  useEffect(() => {
    const run = (key: string): void => { current.current[key]?.(); };
    const onKey = (e: KeyboardEvent): void => {
      const key = stageKeyOf(e);
      if (key !== null) run(key);
    };
    document.addEventListener('keydown', onKey);
    const off = server.subscribe((e) => { if (e.type === 'stage-key') run(e.key); });
    return () => {
      document.removeEventListener('keydown', onKey);
      off();
    };
  }, []);
}
