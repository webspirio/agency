// mocks/driver-report/src/pages/driver/requests/RequestCard.tsx
/**
 * One thing the office needs from the driver (§3.3 D-13): a hold card, 6rem minimum, with the page in question 4rem
 * square on the right, what is being asked in the title, why under it, who asked and when, one outline action by
 * type, and the three preset replies.
 *
 * IT MARKS ITSELF READ. «Побачив» is not a tap — a driver who reads a card and puts the phone down has answered the
 * office's real question, so half the card on screen for a second is what records it (§3.3 D-13, «Seen»). That is an
 * `IntersectionObserver` around THIS card rather than a scroll listener on the page: the ratio is what the rule is
 * written in, and one observer per card cannot mark the wrong request. The ratio and the second live here, with the
 * element they measure.
 *
 * The callback is held in a ref so the effect's only dependencies are the card's identity and whether it is already
 * read. A parent that rebuilt its handler each render would otherwise tear the observer down and rebuild it before
 * the second was up, and the card would never be read at all — silently, because nothing would be red.
 *
 * Where IntersectionObserver is absent the card simply never marks itself read: a page that throws in the cab is a
 * worse answer than a request the office has to ask about a second time.
 */
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { Phone, RefreshCcw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fmtTime } from '../../../app/format';
import { Artefact } from '../../../components/artefacts';
import { HoldCard, QuietButton } from '../../../components/driver';
import type { RequestCardView } from '../../../domain/dto';
import type { RequestType } from '../../../domain/types';

/** The three presets of §3.3 D-13, in the order the spec lists them. The value is the `REQUEST_REPLY` payload. */
export type ReplyKind = 'LATER' | 'NO_DOCUMENT' | 'CALL_ME';
export const REPLIES: readonly { kind: ReplyKind; word: string }[] = [
  { kind: 'LATER', word: 'Зроблю на зупинці' },
  { kind: 'NO_DOCUMENT', word: 'Документа немає' },
  { kind: 'CALL_ME', word: 'Подзвоніть мені' },
];

/** The outline action, by request type (§3.3 D-13). Only these two types are P0 (`REQUEST_TYPES`). */
const ACTION: Record<RequestType, { word: string; icon: LucideIcon }> = {
  RETAKE_PHOTO: { word: 'Перезняти', icon: RefreshCcw },
  CALL_ME: { word: 'Подзвонити', icon: Phone },
};

/** «Перезняти: ТТН 2 з 2, зворотний бік» — the ask and the page, in one line. */
export const titleOf = (request: RequestCardView): string =>
  request.type === 'RETAKE_PHOTO' ? `${ACTION.RETAKE_PHOTO.word}: ${request.target_label}` : request.target_label;

/** Half the card, for a second (§3.3 D-13 «Seen»). */
const SEEN_RATIO = 0.5;
const SEEN_MS = 1000;

export function RequestCard({ request, onPrimary, onReply, onSeen }: {
  request: RequestCardView;
  onPrimary(): void;
  onReply(kind: ReplyKind): void;
  onSeen(): void;
}): JSX.Element {
  const box = useRef<HTMLDivElement | null>(null);
  const seen = useRef(onSeen);
  useEffect(() => {
    seen.current = onSeen;
  });

  const { id } = request;
  useEffect(() => {
    const el = box.current;
    if (el === null || typeof IntersectionObserver === 'undefined') return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const watch = new IntersectionObserver((entries) => {
      const enough = entries.some((e) => e.isIntersecting && e.intersectionRatio >= SEEN_RATIO);
      if (!enough) {
        stop();
        return;
      }
      timer ??= setTimeout(() => {
        timer = null;
        seen.current();
      }, SEEN_MS);
    }, { threshold: [SEEN_RATIO] });
    watch.observe(el);
    return () => {
      stop();
      watch.disconnect();
    };
  }, [id]);

  const action = ACTION[request.type];
  const thumb = request.thumb_variant === null
    ? undefined
    : <Artefact variant={request.thumb_variant} size="thumb" className="rounded-[8px]" />;

  return (
    <div ref={box} className="flex w-full flex-col gap-2">
      <HoldCard icon={action.icon} title={titleOf(request)} thumb={thumb}>
        {request.reason_line === '' ? null : (
          <span className="text-[1rem] leading-[1.375rem]" style={{ color: 'var(--text-2)' }}>{request.reason_line}</span>
        )}
        <span className="font-mono text-[0.875rem] leading-[1.25rem]" style={{ color: 'var(--text-2)' }}>
          {`${request.by_short} · ${fmtTime(request.created_at)}`}
        </span>
      </HoldCard>
      <QuietButton icon={action.icon} label={action.word} onPress={onPrimary} />
      <div className="flex flex-col gap-2">
        {REPLIES.map((r) => (
          <QuietButton key={r.kind} label={r.word} onPress={() => { onReply(r.kind); }} />
        ))}
      </div>
    </div>
  );
}
