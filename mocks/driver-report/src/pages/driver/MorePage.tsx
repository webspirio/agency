// mocks/driver-report/src/pages/driver/MorePage.tsx
/** «Ще» — everything that is not today's work (§3.3 D-18, D-20, §8.2 D-17/18/20/21 #2–#3, §8.6 #10).
 *
 *  THE ONLY `AlertDialog` ON THE WHOLE DRIVER ROUTE IS «Вийти», and that is a rule with a check behind it (§8.6
 *  #10): a driver is never stopped by a modal for connectivity, for a slow answer or for anything the app can simply
 *  remember. He is stopped exactly once, for the one action that destroys work — leaving with records the office has
 *  not got. Everything else on this screen is a row that goes somewhere.
 *
 *  «Тема» OFFERS TWO CHOICES, NOT THREE. «Як у системі» is deliberately absent (D15): light is the default on every
 *  surface and a phone left on the OS's night mode must not silently turn a daytime cab screen dark. The switch
 *  writes the kit's stored preference through `useDarkTheme`, which is the one owner of that choice.
 *
 *  «Змінити водія» AND «Про телефон» ARE HISTORY STATE, NOT ROUTES, exactly as home's `SegmentPanel` is: the router
 *  is written once in W0-18, and a panel that is not a URL cannot be pasted into a chat and opened out of context.
 *
 *  ONE NUMBER, ONE SOURCE. The count in the dialog, the count in «Про телефон» and the SyncStrip on home all read
 *  the same outbox: an entry that is not DONE and not undone is an entry the office has not got. `today.requests` is
 *  the open-ask count, and the month comes from the server clock — never a literal (§0.1, §8.6 #3). */
import { useState, type JSX } from 'react';
import { AlertDialog } from 'radix-ui';
import { CalendarRange, ChevronRight, Flag, LogOut, MessageCircleQuestionMark, Moon, ShieldCheck, Smartphone,
  Sun, UserRound, type LucideIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useToday } from '../../api/hooks';
import { DEVICE_ID } from '../../app/device';
import { fmtTime, pluralN } from '../../app/format';
import { useServerNow } from '../../app/live';
import { clearPhone, pendingRecords, useOutbox } from '../../app/outbox';
import { useDarkTheme } from '../../app/theme';
import { ActionBar, DriverSkeleton, LightPage, PrimaryAction, QuietButton } from '../../components/driver';
import { DC } from '../../copy/driver';
import { businessDate } from '../../domain/clock';
import { project } from '../../domain/project';
import { useDriverGuard } from './DriverShell';

const TITLE = 'Ще';
const MY_MONTH = 'Мій місяць';
const NEEDED = 'Потрібно від вас';
const END_SHIFT = 'Закінчити зміну';
const OFFICE_SEES = 'Що бачить офіс';
const THEME = 'Тема';
const LIGHT = 'Світла';
const DARK = 'Темна';
const SWITCH_DRIVER = 'Змінити водія';
const ABOUT_PHONE = 'Про телефон';
const EXIT = 'Вийти';
const STAY = 'Залишитись';
const EXIT_ANYWAY = 'Все одно вийти';
const LOSE = 'Якщо вийдете — вони пропадуть.';
const UNSENT = 'ще не в офісі';
const BOUND_TO = 'Цей телефон підключено до';
const ANOTHER_DRIVER = 'Інший водій на цьому телефоні? Нехай диспетчер покаже йому QR-код — телефон підключиться до нього.';
const EXIT_AND_BIND = 'Вийти і підключити іншого';
const SAFE = 'Збережено надійно: так (у макеті)';
const PHONE_IS = 'Телефон';
const LAST_CONTACT = "Останній зв'язок";
/** §3.3 D-18 spells this line with a word that is itself on the banned list of §8.6 #1, which
 *  `src/copy/words.test.ts` enforces over every file under `src/pages/driver/` — comments included, which is how
 *  this very comment was caught for naming the stem. The check wins (HARD RULE 2), so the count is said in the
 *  vocabulary the rest of the route already uses for it: «В офісі ✓», «3 записи ще не в офісі». It is an
 *  INTEGRATOR NOTE in this task's report, because the spec's own copy and the spec's own check disagree. */
const STILL_HERE = 'Ще не в офісі';
const UNKNOWN = '—';

/** A 4rem row of «Ще»: the icon, the words, and the chevron that says it leads somewhere (§3.3 D-18). */
function Row({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress(): void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onPress}
      className="card-ring flex h-tap-lg w-full items-center gap-3 px-4 text-left"
    >
      <Icon aria-hidden="true" className="size-[1.5rem] shrink-0" />
      <span className="min-w-0 flex-1 truncate text-[1.125rem] leading-[1.5rem] font-semibold">{label}</span>
      <ChevronRight aria-hidden="true" className="size-[1.25rem] shrink-0" style={{ color: 'var(--text-3)' }} />
    </button>
  );
}

/** One line of «Про телефон» — one sentence, one text node, exactly as §3.3 D-18 writes it. */
function Fact({ line }: { line: string }): JSX.Element {
  return (
    <p className="card-ring flex min-h-tap w-full items-center px-4 text-[1.0625rem] leading-[1.5rem]">{line}</p>
  );
}

export function MorePage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const guard = useDriverGuard();
  const now = useServerNow();
  const today = useToday().data ?? null;
  const entries = useOutbox(DEVICE_ID);
  const { dark, setDark } = useDarkTheme();
  const [leaving, setLeaving] = useState(false);

  /** Not DONE and not undone: the office has not got it. The same rule the SyncStrip and the ReceiptCard read. */
  const unsent = entries.filter((e) => e.state !== 'DONE' && !e.undone).length;

  /** «Вийти» (§3.3 D-18): the phone forgets what it held. Nothing is unbound — the office decides that (D-20). */
  const leave = (): void => {
    clearPhone(DEVICE_ID);
    void navigate('/bind');
  };
  const askToLeave = (): void => {
    if (unsent === 0) {
      leave();
      return;
    }
    setLeaving(true);
  };

  const panel = (location.state as { panel?: unknown } | null)?.panel;
  const back = (): void => { void navigate(-1); };
  const openPanel = (name: string): void => { void navigate('/more', { state: { panel: name } }); };
  const go = guard((to: string) => { void navigate(to); });

  const dialog = (
    <AlertDialog.Root open={leaving} onOpenChange={(open) => { if (!open) setLeaving(false); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50" style={{ background: 'var(--scrim)' }} />
        <AlertDialog.Content
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[35rem] rounded-t-[18px] bg-label text-ink"
          style={{ boxShadow: 'var(--elev-2)' }}
        >
          <div
            className="flex flex-col gap-3 px-gutter pt-4"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <AlertDialog.Title className="text-[1.25rem] leading-[1.625rem] font-semibold">
              {`${pluralN(unsent, DC.plurals.record)} ${UNSENT}`}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>
              {LOSE}
            </AlertDialog.Description>
            {/* The accent fill, but NOT `data-accent`: that marker counts a SCREEN's one state-advancing button
                (PrimaryAction, I-15), and this dialog is layered over a screen that may already carry it — on the
                D-20 panel it does. Radix hides the page beneath from the a11y tree while the dialog is open, so
                the one button a driver can reach is this one either way. */}
            <AlertDialog.Cancel
              className="flex h-tap-lg w-full items-center justify-center rounded-[14px] px-4 text-[1.25rem] leading-[1.5rem] font-semibold"
              style={{ background: 'var(--accent-ink)', color: '#ffffff' }}
            >
              {STAY}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={leave}
              className="tap-ring flex min-h-tap w-full items-center justify-center rounded-[12px] px-3 text-[1.125rem] leading-[1.5rem] font-semibold"
            >
              {EXIT_ANYWAY}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );

  if (panel === 'driver') {
    return (
      <LightPage
        title={SWITCH_DRIVER}
        onBack={back}
        bar={(
          <ActionBar>
            <PrimaryAction icon={LogOut} verb={EXIT_AND_BIND} onPress={askToLeave} />
            <QuietButton label={DC.back} onPress={back} />
          </ActionBar>
        )}
      >
        <p className="text-[1.125rem] leading-[1.75rem]">{`${BOUND_TO}: ${today?.driver?.name ?? UNKNOWN}`}</p>
        <p className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>{ANOTHER_DRIVER}</p>
        {dialog}
      </LightPage>
    );
  }

  if (panel === 'phone') {
    return (
      <LightPage title={ABOUT_PHONE} onBack={back}>
        <Fact line={`${PHONE_IS}: ${today?.device.os_label ?? UNKNOWN}`} />
        <Fact line={SAFE} />
        <Fact line={`${STILL_HERE}: ${unsent}`} />
        <Fact line={`${LAST_CONTACT} ${today?.last_contact_at == null ? UNKNOWN : fmtTime(today.last_contact_at)}`} />
      </LightPage>
    );
  }

  if (today === null) {
    return <LightPage title={TITLE} onBack={() => { void navigate('/'); }}><DriverSkeleton /></LightPage>;
  }

  const shiftOpen = project(today, pendingRecords(DEVICE_ID), now).shiftOpen;

  return (
    <LightPage title={TITLE} onBack={() => { void navigate('/'); }}>
      <Row icon={CalendarRange} label={MY_MONTH} onPress={() => { go(`/month/${businessDate(now).slice(0, 7)}`); }} />
      <Row
        icon={MessageCircleQuestionMark}
        label={`${NEEDED} (${today.requests.length})`}
        onPress={() => { go('/requests'); }}
      />
      {shiftOpen ? <Row icon={Flag} label={END_SHIFT} onPress={() => { go('/shift/end'); }} /> : null}
      <Row icon={ShieldCheck} label={OFFICE_SEES} onPress={() => { go('/office-sees'); }} />

      <div className="card-ring flex min-h-tap w-full items-center gap-3 px-4">
        <span className="shrink-0 text-[1.125rem] leading-[1.5rem] font-semibold">{THEME}</span>
        <span
          role="group"
          aria-label={THEME}
          className="ml-auto flex min-h-tap items-center gap-1 rounded-[12px] p-1"
          style={{ background: 'var(--bench)' }}
        >
          <button
            type="button"
            aria-pressed={!dark}
            onClick={() => { setDark(false); }}
            className="flex min-h-[2.75rem] items-center gap-2 rounded-[10px] px-3 text-[1rem] leading-[1.375rem] font-semibold"
            style={dark ? undefined : { background: 'var(--label)', boxShadow: 'var(--elev-1)' }}
          >
            <Sun aria-hidden="true" className="size-[1.125rem] shrink-0" />
            {LIGHT}
          </button>
          <button
            type="button"
            aria-pressed={dark}
            onClick={() => { setDark(true); }}
            className="flex min-h-[2.75rem] items-center gap-2 rounded-[10px] px-3 text-[1rem] leading-[1.375rem] font-semibold"
            style={dark ? { background: 'var(--label)', boxShadow: 'var(--elev-1)' } : undefined}
          >
            <Moon aria-hidden="true" className="size-[1.125rem] shrink-0" />
            {DARK}
          </button>
        </span>
      </div>

      <Row icon={UserRound} label={SWITCH_DRIVER} onPress={() => { openPanel('driver'); }} />
      <Row icon={Smartphone} label={ABOUT_PHONE} onPress={() => { openPanel('phone'); }} />
      <Row icon={LogOut} label={EXIT} onPress={askToLeave} />
      {dialog}
    </LightPage>
  );
}
