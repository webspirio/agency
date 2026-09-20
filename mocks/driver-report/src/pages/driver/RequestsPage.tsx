// mocks/driver-report/src/pages/driver/RequestsPage.tsx
/**
 * «Потрібно від вас» — the office's asks, answered without a call (§3.3 D-13, §2.2 `#/requests`).
 *
 * Two kinds of answer and both are records. The outline action opens the deep link of §2.4 — for a retake that is
 * the capture step for exactly that page — and the three presets commit `REQUEST_REPLY` and hand a receipt to home,
 * because a preset is a commit like any other and a driver who taps one must see it land (§3.3 D-02). Reading the
 * card commits `REQUEST_SEEN`, which is the one record here that is SILENT: a receipt for having read something is
 * noise, and a `ReceiptMeta` of `null` is exactly what the outbox reserves for a marker.
 *
 * The records are enqueued straight onto the phone's outbox rather than through a flow: a reply has no steps, no
 * pages and no draft to resume, and a `useFlow` draft that is never committed would leave a «Продовжимо: …» card on
 * home for something the driver has already answered.
 *
 * `marked` is a ref rather than a read of `seen_at`, because what this page renders is the office's LAST answer: a
 * request just marked read is still `seen_at: null` there until the record has been sent and the query refetched,
 * and a second marker would be a second record for the same fact.
 */
import type { JSX } from 'react';
import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Inbox } from 'lucide-react';
import { useToday } from '../../api/hooks';
import { server } from '../../api/server';
import { DEVICE_ID } from '../../app/device';
import { fmtTime } from '../../app/format';
import { enqueue, type ReceiptMeta } from '../../app/outbox';
import { buildRecord } from '../../app/records';
import { DriverSkeleton, LightPage } from '../../components/driver';
import type { Payloads, RecordType } from '../../domain/types';
import { useDriverGuard } from './DriverShell';
import { REPLIES, RequestCard, type ReplyKind } from './requests/RequestCard';

const TITLE = 'Потрібно від вас';
const EMPTY = 'Від диспетчера нічого не потрібно';
const EMPTY_HINT = "Коли офіс щось попросить — це з'явиться тут і на головному екрані.";
const DONE_TODAY = 'Виконано сьогодні';
const DONE_AT = 'виконано';
const ANSWER = 'Відповідь';

/** One record the phone owes the office, minted and queued at the tap (D11, EC-137). A reply carries a receipt; a
 *  read-marker carries none. */
function push<T extends RecordType>(type: T, payload: Payloads[T], receipt: ReceiptMeta | null): void {
  const seq = server.mintSeq(DEVICE_ID);
  const at = server.clock.nowIso();
  enqueue(DEVICE_ID, {
    record: buildRecord({ deviceId: DEVICE_ID, seq, occurredAt: at, committedAt: at }, type, payload),
    pages: [],
    receipt,
  });
}

const wordOf = (kind: ReplyKind): string => REPLIES.find((r) => r.kind === kind)?.word ?? kind;

export function RequestsPage(): JSX.Element {
  const navigate = useNavigate();
  const today = useToday();
  const data = today.data;
  const guard = useDriverGuard();
  const marked = useRef<Set<string>>(new Set());

  const home = (): void => { navigate('/'); };

  const markSeen = useCallback((id: string) => {
    if (marked.current.has(id)) return;
    marked.current.add(id);
    push('REQUEST_SEEN', { request_id: id }, null);
  }, []);

  /** A REF, not state (§8.6 #13, EC-137). Two taps 50 ms apart land in ONE React batch, so both handlers run against
   *  the same render and a `useState` flag would still read false for the second — measured in
   *  `never.driver.test.tsx`, which filed two `REQUEST_REPLY` records, each with its own freshly minted seq. A
   *  reply ends the page, so one per mount is the whole rule; `markSeen` above already works this way. */
  const replied = useRef(false);

  const reply = (id: string, kind: ReplyKind): void => {
    if (replied.current) return;
    replied.current = true;
    push('REQUEST_REPLY', { request_id: id, reply: kind }, { title: `${ANSWER}: ${wordOf(kind)}`, next: null });
    navigate('/', { replace: true });
  };

  return (
    <LightPage title={TITLE} onBack={home}>
      {data === undefined ? <DriverSkeleton /> : (
        <>
          {data.requests.length === 0 ? (
            <div className="flex w-full flex-col items-start gap-2 py-6">
              <Inbox aria-hidden="true" className="size-[2rem]" style={{ color: 'var(--text-2)' }} />
              <p className="text-[1.25rem] leading-[1.75rem] font-semibold">{EMPTY}</p>
              <p className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>{EMPTY_HINT}</p>
            </div>
          ) : data.requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onPrimary={guard(() => { navigate(`/request/${request.id}`); })}
              onReply={guard((kind: ReplyKind) => { reply(request.id, kind); })}
              onSeen={() => { markSeen(request.id); }}
            />
          ))}
          {data.requests_done_today.length === 0 ? null : (
            <div className="flex w-full flex-col gap-1 pt-2">
              <p className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>
                {`${DONE_TODAY}: ${data.requests_done_today.length}`}
              </p>
              {data.requests_done_today.map((done) => (
                <p key={done.id} className="font-mono text-[0.875rem] leading-[1.25rem]"
                  style={{ color: 'var(--text-2)' }}>
                  {`${DONE_AT} ${fmtTime(done.done_at)}`}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </LightPage>
  );
}
