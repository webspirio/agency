// mocks/driver-report/src/pages/driver/home/StandaloneBanner.tsx
/** The one-device confession (§2.1, EC-134). The driver route opened on a real phone OUTSIDE the stage has no console
 *  beside it, so a record it files has nowhere visible to land: the client would tap «Завантажено», see «В офісі ✓»
 *  and reasonably conclude something arrived somewhere. It did not — there is one store per browser (§7.7) — so the
 *  phone says so before it is asked.
 *
 *  It is a hold card and not a dialog: nothing is refused and nothing is waiting on an answer (§8.6 #10). «Зрозумів»
 *  dismisses it for this page load only; there is no stored flag, because the next person handed the phone deserves
 *  the same sentence. */
import { useState, type JSX } from 'react';
import { Smartphone } from 'lucide-react';
import { HoldCard, QuietButton } from '../../../components/driver';

const TITLE = "Макет на одному пристрої: записи не йдуть в офіс. Щоб побачити обидві сторони — відкрийте на комп'ютері.";
const GOT_IT = 'Зрозумів';

export function StandaloneBanner(): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="mx-auto w-full max-w-[35rem] px-gutter pt-3">
      <HoldCard icon={Smartphone} title={TITLE}>
        <span className="block pt-2">
          <QuietButton label={GOT_IT} onPress={() => { setDismissed(true); }} />
        </span>
      </HoldCard>
    </div>
  );
}
