// mocks/driver-report/src/stage/bar/HiddenMenu.tsx
/** «⋯» (§5.4 #11, §5.5) — the six things a presenter reaches for once in a demo and must never hit by accident.
 *
 *  THAT IS WHY IT IS HIDDEN. «Текст 130 %» is Григорій's Redmi read at an OS text size, «Екран телефону 390 × 844»
 *  is a different handset, «Сховати позначки «імітація»» is for the screenshot that goes into the proposal — each
 *  of them changes what the audience is looking at mid-sentence, and none of them belongs on a 40 px bar between
 *  «Офлайн» and «Скинути демо».
 *
 *  «Справжня камера» is here BECAUSE it does nothing. The stage never calls `getUserMedia` (D4, §8.6 #14): a
 *  permission prompt in front of a client cannot be recovered from, and a browser that has already been denied
 *  once shows nothing at all. An absent item invites somebody to ask for one; a visible, disabled item with «лише
 *  на телефоні» beside it answers the question before it is asked.
 *
 *  The rows write to `server` rather than through a callback each, the way `BeatCue` and `LinkIndicator` read from
 *  it: every one of them is a toggle or a `ui` patch with no rebuild and no frame reload behind it, and routing six
 *  one-line writes up through the bar as six props would say nothing the `server.setToggle` calls do not. */
import { useState, type JSX } from 'react';
import { cn } from '@agency/kit/lib/cn';
import { server, type StageUi, type Toggles } from '../../api/server';
import { BarMenu, BAR_MENU_ITEM } from './BarMenu';

/** The OS text size of Григорій's phone (§5.3, EC-78) — the label the spec pins, plain space before the «%». */
const BIG_TEXT = 'Текст 130 %';
/** D1: the two handsets the demo is ever shown on. */
const VIEWPORTS = [
  { id: '360x670', label: 'Екран телефону: 360 × 670' },
  { id: '390x844', label: 'Екран телефону: 390 × 844' },
] as const;
/** §5.5 «Один екран: 1 — телефон · 2 — консоль · 3 — обидва», as three rows: the row IS the key it documents. */
const PANES = [
  { id: 'phone', label: 'Один екран: 1 — телефон' },
  { id: 'console', label: 'Один екран: 2 — консоль' },
  { id: 'both', label: 'Один екран: 3 — обидва' },
] as const;

export function HiddenMenu({ ui, toggles }: { ui: StageUi; toggles: Toggles }): JSX.Element {
  const [open, setOpen] = useState(false);
  const close = (): void => { setOpen(false); };
  const bigText = toggles.textScale[ui.phone] === true;

  return (
    <BarMenu label="⋯" name="Ще" open={open} onOpen={setOpen} align="end" width={320}>
      <Item
        label={bigText ? `${BIG_TEXT}: увімкнено` : BIG_TEXT}
        on={bigText}
        onPick={() => {
          close();
          server.setToggle('textScale', { ...toggles.textScale, [ui.phone]: !bigText });
        }}
      />

      {VIEWPORTS.map((v) => (
        <Choice
          key={v.id}
          label={v.label}
          on={toggles.viewport === v.id}
          onPick={() => { close(); server.setToggle('viewport', v.id); }}
        />
      ))}

      {PANES.map((p) => (
        <Choice
          key={p.id}
          label={p.label}
          on={ui.single === p.id}
          onPick={() => { close(); server.setUi({ single: p.id }); }}
        />
      ))}

      <Item
        label={toggles.hideSimChips
          ? 'Сховати позначки «імітація» (для знімків): увімкнено'
          : 'Сховати позначки «імітація» (для знімків)'}
        on={toggles.hideSimChips}
        onPick={() => { close(); server.setToggle('hideSimChips', !toggles.hideSimChips); }}
      />

      <Item
        label="Відкрити запасну вкладку"
        on={false}
        onPick={() => {
          close();
          window.open(`?profile=demo#/beat/${ui.beat ?? 0}`);
        }}
      />

      <Item label="Справжня камера" on={false} hint="лише на телефоні" />
    </BarMenu>
  );
}

/** A row that does something, or — with no `onPick` — one that visibly cannot (see the header on «Справжня камера»).
 *  `aria-disabled` AND `disabled`: the first is what a screen reader and a test read, the second is what stops a
 *  click, and a row carrying only the attribute is still clickable. */
function Item({ label, on, hint, onPick }: { label: string; on: boolean; hint?: string; onPick?: () => void }): JSX.Element {
  const off = onPick === undefined;
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={off || undefined}
      disabled={off}
      onClick={onPick}
      className={cn(BAR_MENU_ITEM, on && 'text-stage-hold')}
    >
      <span>{label}</span>
      {hint === undefined ? null : <span className="text-stage-text-2">{hint}</span>}
    </button>
  );
}

/** One of a set — a viewport, a pane. `menuitemradio` rather than `menuitem`, because "which of these three" is
 *  exactly what the role means and the checkmark is then the browser's job rather than a glyph in the label. */
function Choice({ label, on, onPick }: { label: string; on: boolean; onPick(): void }): JSX.Element {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={on}
      onClick={onPick}
      className={cn(BAR_MENU_ITEM, on && 'bg-[#1b242a] text-stage-accent')}
    >
      <span>{label}</span>
    </button>
  );
}
