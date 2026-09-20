// mocks/driver-report/src/pages/driver/stand/ProblemPages.tsx
/**
 * The four pages «Стою» opens before it records anything (§3.3 D-11): the one question a breakdown needs, the call
 * that must happen before an accident is written down, and the two pages the driver only READS.
 *
 * They live beside `StandPage` rather than inside it because each is a screen with its own consequence sentence, and
 * because the ordering rule they share is the point: the phone never records «ДТП» or «Проблема з пломбою» and then
 * tells him to call — the call is on the screen first, and the record is what he taps afterwards.
 *
 * NO ACCENT ON «Можете їхати?». The two answers are equal offers and the app does not lean: «Не можу їхати» raises
 * `BREAKDOWN_CANT_DRIVE` in «Зараз» and «Можу їхати» does not, but which one is true is the driver's to say.
 */
import type { JSX } from 'react';
import { Check, LockOpen, Wrench } from 'lucide-react';
import { CallButton, HoldCard, LightPage, PrimaryAction, QuietButton } from '../../../components/driver';
import type { OnCallView } from '../../../domain/dto';

const TITLE = 'Стою';
const UNDERSTOOD = 'Зрозумів';

/** «Ірина Коваленко, диспетчер» — the person on the rota, as the call button and the sentence above it name her. */
const whoOf = (onCall: OnCallView): { name: string; role: string } => ({ name: onCall.name, role: onCall.role_label });
const named = (onCall: OnCallView): string => `${onCall.name}, ${onCall.role_label}`;

function Sentence({ text }: { text: string }): JSX.Element {
  return <p className="text-[1.125rem] leading-[1.625rem]">{text}</p>;
}

/** «Поломка» → the one thing the dispatcher has to know first (§3.3 D-11). Photos are P1. */
export function BreakdownQuestion({ onBack, onAnswer }: {
  onBack(): void;
  onAnswer(canDrive: boolean): void;
}): JSX.Element {
  return (
    <LightPage
      title={TITLE}
      onBack={onBack}
      bar={
        <div className="flex gap-2">
          <QuietButton half icon={Wrench} label="Можу їхати" onPress={() => { onAnswer(true); }} />
          <QuietButton half icon={Wrench} label="Не можу їхати" tone="hold" onPress={() => { onAnswer(false); }} />
        </div>
      }
    >
      <h1 className="text-[1.25rem] leading-[1.75rem] font-semibold">Можете їхати?</h1>
    </LightPage>
  );
}

/** «ДТП» → the call comes FIRST and the record second, because a man at a roadside needs a person, not a form. */
export function AccidentPage({ onBack, onCall, onRecord }: {
  onBack(): void;
  onCall: OnCallView;
  onRecord(): void;
}): JSX.Element {
  return (
    <LightPage
      title={TITLE}
      onBack={onBack}
      bar={<QuietButton label="Записати ДТП" onPress={onRecord} />}
    >
      <Sentence text={`Спершу подзвоніть: ${named(onCall)}`} />
      <CallButton person={whoOf(onCall)} phone={onCall.phone} />
    </LightPage>
  );
}

/** «Проблема з пломбою» → a hold card, because the consequence is «do not take the load» and that must not read as
 *  one row among eight. */
export function SealPage({ onBack, onCall, onOk }: {
  onBack(): void;
  onCall: OnCallView;
  onOk(): void;
}): JSX.Element {
  return (
    <LightPage
      title={TITLE}
      onBack={onBack}
      bar={<PrimaryAction icon={Check} verb={UNDERSTOOD} onPress={onOk} />}
    >
      <HoldCard icon={LockOpen} title="Не приймайте вантаж з такою пломбою." body={`Подзвоніть: ${named(onCall)}`} />
      <CallButton person={whoOf(onCall)} phone={onCall.phone} />
    </LightPage>
  );
}

/** «Є розбіжність» → a page he only reads. The акт photo is P1; the words on it are what keeps his signature from
 *  agreeing with a figure he does not. */
export function DiscrepancyPage({ onBack, onOk }: { onBack(): void; onOk(): void }): JSX.Element {
  return (
    <LightPage
      title={TITLE}
      onBack={onBack}
      bar={<PrimaryAction icon={Check} verb={UNDERSTOOD} onPress={onOk} />}
    >
      <Sentence text={'Не згодні? Напишіть в акті, в графі «Особливі відмітки»: «Не згоден» — і підпишіть. Потім сфотографуйте акт.'} />
    </LightPage>
  );
}
