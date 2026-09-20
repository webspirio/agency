// mocks/driver-report/src/pages/office/PrintPage.tsx
/** C-09 «Друк» — the A4 preview (§4.2 C-09, 02 UC-O09 step 5).
 *
 *  OPENING THE PREVIEW IS THE PRINT. `printTruckDay` fires once on mount rather than behind «Друк у браузері»,
 *  because the paper file continues whether or not the browser's own dialog is used — the office may photograph the
 *  screen, save a PDF, or print from a second machine — and the driver's «Мій день» needs to say «Лист за день
 *  надруковано — підпишіть, коли здаватимете документи» in every one of those cases. The handler is idempotent (a
 *  reprint changes nothing), and the ref guard makes StrictMode's double mount fire it once all the same.
 *
 *  THIS ROUTE IS OUTSIDE THE CONSOLE SHELL (I-16) — no sidebar, no header, nothing that would print. So it carries
 *  its own `BootGate`: a pasted `#/day/…/print` link opened standalone has no server yet, and the shell that would
 *  normally have built one is not above this route.
 *
 *  The sheet is scaled to the viewport HEIGHT, never the width: a waybill the office cannot read whole is a waybill
 *  they will print to check. `@media print` in index.css drops the toolbar (`data-print-hide`) and the transform
 *  (`data-print-sheet`), so the paper gets the sheet at 1:1 with no shadow and no ring.
 *
 *  `/` and `-` here are pixel arithmetic, not money: `agency/no-float-arithmetic` is off under `src/pages/**` by
 *  design and nothing on this page is a decimal. */
import { useEffect, useRef, useState, type JSX } from 'react';
import { Button } from '@agency/kit/button';
import { Printer, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { codeOf } from '../../api/contract';
import { usePrintTruckDay, useTruckDay } from '../../api/hooks';
import { SAYS_TRUCK_DAY } from '../../api/says';
import { BootGate } from '../../app/boot';
import { PrintSheet, SHEET_H } from './day/PrintSheet';

const TOOLBAR_H = 48;
const GUTTER = 32;

function Preview(): JSX.Element {
  const { truckDayId = '' } = useParams();
  const navigate = useNavigate();
  const day = useTruckDay(truckDayId);
  const print = usePrintTruckDay(truckDayId);

  const printed = useRef(false);
  const fire = print.mutate;
  useEffect(() => {
    if (printed.current) return;
    printed.current = true;
    fire();
  }, [fire]);

  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = (): void => setScale(Math.min(1, (window.innerHeight - TOOLBAR_H - GUTTER) / SHEET_H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const view = day.data ?? null;

  return (
    <div className="min-h-dvh bg-ink">
      <div
        data-print-hide=""
        className="flex h-[48px] items-center justify-between gap-[16px] px-[16px]"
      >
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer aria-hidden="true" />
          Друк у браузері
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { void navigate(truckDayId === '' ? '/days' : `/day/${truckDayId}`); }}
        >
          <X aria-hidden="true" />
          Закрити
        </Button>
      </div>

      {view === null ? (
        <p className="px-[24px] py-[24px] text-center text-[14px] text-label">
          {day.isPending
            ? 'Готуємо лист…'
            : codeOf('getTruckDay', day.error) === 'TRUCK_DAY_NOT_FOUND'
              ? SAYS_TRUCK_DAY.TRUCK_DAY_NOT_FOUND
              : 'Лист не відкрився.'}
        </p>
      ) : (
        <div className="flex justify-center pb-[16px]">
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
            <PrintSheet view={view} />
          </div>
        </div>
      )}
    </div>
  );
}

export function PrintPage(): JSX.Element {
  return <BootGate defaultBeat={10}><Preview /></BootGate>;
}
