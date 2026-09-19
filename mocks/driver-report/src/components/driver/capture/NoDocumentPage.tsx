// mocks/driver-report/src/components/driver/capture/NoDocumentPage.tsx
/**
 * «Чому немає документа?» (§3.3 D-06, §8.6 #11) — the way through a capture step that cannot be taken.
 *
 * This page is what makes «a missing required photo» the ONLY hard stop on the driver route, and even that one
 * answerable: every row ends in a committed record with a reason the office can act on, so the driver is never left
 * holding a screen he cannot leave.
 *
 * ONE row is not a reason but a warning. «Відправник не дав ТТН» opens the fine first — 17 000 ₴ is the driver's own
 * money and the consequence of driving out without the paper, not of using the app — with the dispatcher's number
 * beside it. «Записати без ТТН» is still there under it: the app records what happened, it does not decide whether
 * he leaves (§0.3, D-11).
 *
 * The commit is one-shot (`useCommitOnce`, §8.6 #13): the reason rows each END the flow, so the first one tapped
 * wins and a second tap on a slow phone cannot send a second record. Choosing the fine page is NOT a commit, so it
 * does not spend the guard.
 */
import type { JSX } from 'react';
import { useState } from 'react';
import { Ban, Check, FileCheck, FileClock, FileText, PhoneCall, Printer, Weight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCommitOnce } from '../../../app/flow';
import type { OnCallView } from '../../../domain/dto';
import type { NoDocReason } from '../../../domain/types';
import { ActionBar } from '../ActionBar';
import { CallButton } from '../CallButton';
import { ChipRow } from '../ChipRow';
import { HoldCard } from '../HoldCard';
import { LightPage } from '../LightPage';
import { PrimaryAction } from '../PrimaryAction';

/** The fine is the sentence the driver is owed, with a non-breaking space inside the number (§0.1). */
const FINE = 'Без ТТН не виїжджайте — за це штраф 17 000 грн. Подзвоніть диспетчеру.';
const TITLE = 'Чому немає документа?';

type Row = { word: string; icon: LucideIcon; reason: NoDocReason; warn?: true };

const ROWS: Record<'TTN_FRONT' | 'TTN_SIGNED' | 'WEIGH_TICKET', Row[]> = {
  TTN_FRONT: [
    { word: 'ТТН ще друкують', icon: Printer, reason: 'PRINTING' },
    { word: 'Відправник не дав ТТН', icon: Ban, reason: 'SHIPPER_REFUSED', warn: true },
    { word: 'Електронна ТТН', icon: FileText, reason: 'ETTN' },
    { word: 'Подзвоніть мені', icon: PhoneCall, reason: 'CALL_ME' },
  ],
  TTN_SIGNED: [
    { word: 'Одержувач не підписує', icon: Ban, reason: 'CONSIGNEE_REFUSES' },
    { word: 'ТТН лишилась у одержувача', icon: FileCheck, reason: 'LEFT_AT_CONSIGNEE' },
    { word: 'Підпишуть пізніше', icon: FileClock, reason: 'SIGN_LATER' },
    { word: 'Електронна ТТН', icon: FileText, reason: 'ETTN' },
    { word: 'Подзвоніть мені', icon: PhoneCall, reason: 'CALL_ME' },
  ],
  WEIGH_TICKET: [
    { word: 'Талона не дали', icon: Weight, reason: 'NO_TICKET' },
  ],
};

export function NoDocumentPage({ artefact, onReason, onBack, onCall }: {
  artefact: 'TTN_FRONT' | 'TTN_SIGNED' | 'WEIGH_TICKET';
  onReason(r: NoDocReason): void;
  onBack(): void;
  onCall: OnCallView;
}): JSX.Element {
  const [warned, setWarned] = useState(false);
  const commit = useCommitOnce();
  const answer = (row: Row): void => {
    if (row.warn === true && !warned) { setWarned(true); return; }
    commit.run(() => { onReason(row.reason); });
  };

  if (warned) {
    return (
      <LightPage
        title={TITLE}
        onBack={() => { setWarned(false); }}
        bar={
          <ActionBar>
            <PrimaryAction icon={Check} verb="Записати без ТТН" busy={commit.busy}
              onPress={() => { commit.run(() => { onReason('SHIPPER_REFUSED'); }); }} />
          </ActionBar>
        }
      >
        <HoldCard icon={FileText} title={FINE} />
        <CallButton person={{ name: onCall.name, role: onCall.role_label }} phone={onCall.phone} />
      </LightPage>
    );
  }

  return (
    <LightPage title={TITLE} onBack={onBack}>
      {ROWS[artefact].map((row) => (
        <ChipRow key={row.reason} icon={row.icon} label={row.word} onPress={() => { answer(row); }} />
      ))}
    </LightPage>
  );
}
