// mocks/driver-report/src/pages/driver/BindConfirmPage.tsx
/** «Це ви?» — the one tap that binds a phone to a driver (§3.3 D-01, §8.2 D-01 #3–#4).
 *
 *  THE GET BINDS NOTHING. `getBindPreview` only names the driver a code belongs to; `confirmBinding` is the write,
 *  and it is the only one this screen performs. A link opened twice, or by the wrong phone, changes nothing until
 *  somebody says «Так, це я».
 *
 *  AN EXPIRED CODE IS DATA IN ONE DIRECTION AND A REFUSAL IN THE OTHER, AND BOTH SAY THE SAME SENTENCE. The preview
 *  answers `status: 'EXPIRED' | 'USED' | 'UNKNOWN'` with a 200 — nothing failed, the code simply is not live — while
 *  a confirm on a code that died between the two calls is `BIND_CODE_EXPIRED`, the only refusal this screen can meet
 *  (§7.5). The second is branched on `codeOf('confirmBinding', err)` and nothing else (HARD RULE 5), and both render
 *  the one `SAYS_BIND` sentence. The word the driver never reads appears nowhere: the code is old, and that is a
 *  fact about the code rather than about him (§8.6 #4).
 *
 *  «Ні, це не я» IS A STATE, NOT A ROUTE. The router is written once in W0-18 and no Wave 2 task adds to it (I-16);
 *  more to the point, a flow's steps are never routes on this app, so a pasted link cannot drop anyone into the
 *  middle of one. Nothing is bound on that branch — the screen simply hands the six digits back, big, to the person
 *  who can give them to the right phone.
 *
 *  WHY THE REDIRECT WAITS FOR `getToday`. Home reads `device.bound` off the last `getToday` and sends an unbound
 *  phone straight back here. The mutation's `invalidateQueries` starts that refetch but does not await it, so
 *  navigating on the mutation's own success lands on a home still holding the UNBOUND answer, which bounces to
 *  `/bind`. The phone is bound when its own today says so, so that is what the redirect waits for — with the primary
 *  reading «Записую…» in between, which is also the double-tap guard of EC-137. */
import { useState, type JSX } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { codeOf } from '../../api/contract';
import { useBindPreview, useConfirmBinding, useToday } from '../../api/hooks';
import { SAYS_BIND } from '../../api/says';
import { fmtCode } from '../../app/format';
import { ActionBar, AppHeader, DriverScreen, DriverSkeleton, HoldCard, PrimaryAction,
  QuietButton } from '../../components/driver';
import { Plate } from '../../components/shared';

const ASK = 'Це ви?';
const YES = 'Так, це я';
const NO = 'Ні, це не я';
const SHOW_IT = 'Покажіть цей екран диспетчеру';
const ANOTHER = 'Ввести інший код';

export function BindConfirmPage(): JSX.Element {
  const navigate = useNavigate();
  const code = useParams().code ?? '';
  const preview = useBindPreview(code);
  const confirm = useConfirmBinding(code);
  const bound = useToday().data?.device.bound === true;
  const [asked, setAsked] = useState(false);
  const [refused, setRefused] = useState(false);
  const [notMe, setNotMe] = useState(false);

  // The office holds the binding AND this phone's own today knows it: only now is home a safe place to be.
  if (asked && bound) return <Navigate to="/" replace />;

  const data = preview.data;
  const dead = refused || (data !== undefined && data.status !== 'VALID');

  if (dead) {
    return (
      <DriverScreen header={<AppHeader />}>
        <HoldCard icon={KeyRound} title={SAYS_BIND.BIND_CODE_EXPIRED} />
        <QuietButton label={ANOTHER} onPress={() => { void navigate('/bind'); }} />
      </DriverScreen>
    );
  }
  if (notMe) {
    return (
      <DriverScreen header={<AppHeader />}>
        <h1 className="text-d-title">{SHOW_IT}</h1>
        <p className="font-mono text-[2.5rem] leading-[3rem] font-semibold tracking-[0.06em]">{fmtCode(code)}</p>
      </DriverScreen>
    );
  }
  if (data === undefined) {
    return <DriverScreen header={<AppHeader />}><DriverSkeleton /></DriverScreen>;
  }

  const say = (): void => {
    setAsked(true);
    confirm.mutate(undefined, {
      onError: (err) => {
        setAsked(false);
        if (codeOf('confirmBinding', err) === 'BIND_CODE_EXPIRED') setRefused(true);
      },
    });
  };

  return (
    <DriverScreen
      header={<AppHeader />}
      bar={(
        <ActionBar>
          <PrimaryAction icon={Check} verb={YES} busy={asked} onPress={say} />
          <QuietButton label={NO} onPress={() => { setNotMe(true); }} />
        </ActionBar>
      )}
    >
      <h1 className="text-d-title">{ASK}</h1>
      <span
        className="grid size-[6rem] place-items-center rounded-full font-sans text-[2rem] font-semibold"
        style={{ background: 'var(--accent-wash)', color: 'var(--accent-ink)' }}
      >
        {data.initials ?? ''}
      </span>
      <p className="text-d-title">{data.driver_name ?? ''}</p>
      <p className="flex items-center gap-2 text-[1.125rem] leading-[1.75rem]">
        {data.truck_plate === null ? null : <Plate plate={data.truck_plate} size="md" />}
        {data.truck_model ?? ''}
      </p>
    </DriverScreen>
  );
}
