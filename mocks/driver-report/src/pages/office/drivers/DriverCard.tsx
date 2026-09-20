// mocks/driver-report/src/pages/office/drivers/DriverCard.tsx
/**
 * The driver card — a right sheet 470 px wide, full screen on a phone (§4.2 C-16) — and the console half of D-01,
 * «Новий водій за один дотик» (§5.6 beat 1).
 *
 * WHAT IT IS FOR: a dispatcher stands beside a driver and connects his phone in under a minute, saying out loud what
 * is about to happen. So the sheet is not a form — it is the SCRIPT of that minute: one primary button mints the
 * code, the QR is big enough to scan across a desk, the countdown says how long the office has, and a three-item
 * checklist ticks itself as the phone answers, so the dispatcher never has to ask «ну що, з'явилось?».
 *
 * THE CHECKLIST TICKS FROM THE SERVER, NOT FROM THIS PANE. Items 1 and 2 follow `binding.state` — `OPENED` when the
 * phone has fetched the code's preview («Це ви?»), `BOUND` when it confirmed — and that state reaches this sheet
 * because the console shell mounts `useLiveSync()`: a write in the phone's pane refetches this pane's active queries
 * 50 ms later. Item 3 is the dispatcher's own tick: nothing on the wire can tell whether he actually showed the man
 * «Заправка» and «Стою», and a checkbox that lies about a human act is worse than one that waits for a human hand.
 *
 * THE CODE IS NEVER TYPED TWICE. Everything on screen — the QR, the six digits, the expiry — comes from the row's
 * `binding`, which the server derives from the one `bindCode` it minted, so a re-render, a refetch or a second
 * dispatcher opening the same card all show the same code rather than three different ones.
 */
import { useState, type JSX, type ReactNode } from 'react';
import { Button } from '@agency/kit/button';
import { Drawer, DrawerBareContent, DrawerClose, DrawerOverlay, DrawerPortal, DrawerTitle } from '@agency/kit/drawer';
import { Check, CircleDashed, X } from 'lucide-react';
import { codeOf } from '../../../api/contract';
import { useCreateBindCode } from '../../../api/hooks';
import { SAYS_DRIVER } from '../../../api/says';
import { fmtCode, fmtTime } from '../../../app/format';
import { useServerNow } from '../../../app/live';
import { Plate, QrPattern } from '../../../components/shared';
import type { DriverRow } from '../../../domain/dto';
import { Countdown } from './Countdown';
import { useWriteOnce } from '../../../app/once';

/** The short form of the link the QR draws and the sentence names — one word, said in two places (§4.2 C-16). */
const BIND_HOST = 'ktl.in.ua/z';
const CONNECT = 'Підключити телефон';
const AGAIN = 'Показати новий';
const EXPIRED = 'Код застарів';
const SMS = 'SMS-код — у пілоті';
const OR_TYPE = `Або відкрийте ${BIND_HOST} і введіть код `;
const MODE: Record<DriverRow['mode'], string> = { APP: 'Застосунок', PAPER: 'Папір' };
const NONE = '—';
const QR_PX = 220;

/** «1» ticks when the phone opened «Це ви?», «2» when it confirmed, «3» by the dispatcher's own hand. */
const STEPS = ['1. Скануйте QR', '2. «Так, це я»', '3. Покажіть «Заправка» і «Стою»'] as const;

function Fact({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-[4px]">
      <span className="eyebrow">{label}</span>
      <span className="flex items-center gap-[8px] text-[14px] leading-[1.35] text-ink">{children}</span>
    </div>
  );
}

function Step({ text, done, onToggle }: { text: string; done: boolean; onToggle?(): void }): JSX.Element {
  const icon = done
    ? <Check size={16} aria-hidden="true" className="shrink-0 text-ink" />
    : <CircleDashed size={16} aria-hidden="true" className="shrink-0 text-text-2" />;
  const body = (
    <>
      {icon}
      <span className={done ? 'text-ink' : 'text-text-2'}>{text}</span>
    </>
  );
  if (onToggle === undefined) {
    return <li className="flex items-center gap-[8px] text-[14px] leading-[1.4]">{body}</li>;
  }
  return (
    <li>
      <button
        type="button"
        aria-pressed={done}
        onClick={onToggle}
        className="flex min-h-[32px] items-center gap-[8px] rounded-[8px] text-left text-[14px] leading-[1.4]"
      >
        {body}
      </button>
    </li>
  );
}

export function DriverCard({ driver, onClose }: { driver: DriverRow; onClose(): void }): JSX.Element {
  const now = useServerNow();
  const bind = useCreateBindCode();
  const [shown, setShown] = useState(false);
  const once = useWriteOnce();

  const { binding } = driver;
  const live = binding.state === 'CODE_SHOWN' || binding.state === 'OPENED';
  const bound = binding.state === 'BOUND';
  const expired = binding.state === 'NONE' && binding.code !== null;
  const refused = bind.isError ? codeOf('createBindCode', bind.error) : undefined;

  return (
    <Drawer direction="right" open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerBareContent
          className="card-ring fixed inset-y-0 right-0 z-50 flex w-full max-w-[470px] flex-col gap-[20px] overflow-y-auto rounded-none p-[24px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        >
          <header className="flex items-start justify-between gap-[16px]">
            <DrawerTitle className="text-[17px] leading-[1.3] font-semibold text-ink">{driver.full_name}</DrawerTitle>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрити">
                <X size={16} aria-hidden="true" />
              </Button>
            </DrawerClose>
          </header>

          <div className="grid grid-cols-2 gap-[16px]">
            <Fact label="Табельний №">{driver.tab_no}</Fact>
            <Fact label="Машина">
              {driver.plate === NONE ? NONE : <Plate plate={driver.plate} size="sm" />}
            </Fact>
            <Fact label="Режим">{MODE[driver.mode]}</Fact>
            <Fact label="Телефон">{driver.phone_label}</Fact>
          </div>

          {refused === undefined ? null : (
            <p className="text-[13px] leading-[1.45] text-reject">{SAYS_DRIVER[refused]}</p>
          )}

          {bound && binding.bound_at !== null ? (
            <p className="text-[15px] leading-[1.4] font-medium text-ink">
              {`Телефон підключено ${fmtTime(binding.bound_at)} · ${binding.device_label ?? NONE}`}
            </p>
          ) : (
            <div className="flex flex-col gap-[10px]">
              {expired ? <p className="text-[14px] leading-[1.4] text-hold">{EXPIRED}</p> : null}
              {live ? null : (
                <Button
                  type="button"
                  disabled={bind.isPending}
                  onClick={() => {
                    // `bind.isPending` is state and is still false for a second click inside the same React batch,
                    // so this minted TWO codes and the second invalidated the QR the driver was already looking at
                    // — measured in `never.office.test.tsx` (§8.6 #13, `src/app/once.ts`).
                    if (!once.claim(driver.id)) return;
                    bind.mutate({ driverId: driver.id }, { onSettled: () => { once.release(); } });
                  }}
                  className="h-[40px] w-fit px-[18px] text-[14px]"
                >
                  {expired ? AGAIN : CONNECT}
                </Button>
              )}
            </div>
          )}

          {live && binding.code !== null && binding.expires_at !== null ? (
            <section className="flex flex-col items-center gap-[12px] rounded-[14px] bg-bench/40 p-[20px]">
              {/* Drawn, never decodable, and the pattern says «імітація» itself (D9, §6.11). */}
              <QrPattern text={`${BIND_HOST}/${binding.code}`} size={QR_PX} />
              <Countdown expiresAt={binding.expires_at} now={now} />
              <p className="text-center text-[14px] leading-[1.45] text-ink">
                {OR_TYPE}
                <span className="font-mono">{fmtCode(binding.code)}</span>
              </p>
              <p className="text-[13px] leading-[1.4] text-text-2">{SMS}</p>
            </section>
          ) : null}

          {live || bound ? (
            <ul className="flex flex-col gap-[8px]">
              <Step text={STEPS[0]} done={binding.state === 'OPENED' || bound} />
              <Step text={STEPS[1]} done={bound} />
              <Step text={STEPS[2]} done={shown} onToggle={() => { setShown((v) => !v); }} />
            </ul>
          ) : null}
        </DrawerBareContent>
      </DrawerPortal>
    </Drawer>
  );
}
