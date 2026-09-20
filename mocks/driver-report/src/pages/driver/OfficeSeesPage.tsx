// mocks/driver-report/src/pages/driver/OfficeSeesPage.tsx
/**
 * «Що бачить офіс» (§3.3 D-17, §8.2 D-17/18/20/21 #1) — one honest page about what leaves the phone, written once
 * and never softened.
 *
 * IT NAMES WHAT IS NOT SENT AS PLAINLY AS WHAT IS. The speed reading of §3.3 D-19 is the reason this page exists:
 * the phone measures it, the driver can feel that it does, and if he first hears about it from somebody else the
 * whole app becomes a tracker in his head. So «Що телефон перевіряє, але не надсилає» sits second, above «Чого
 * немає» — background tracking, his contacts, his gallery, any account of phone use on the road.
 *
 * THE FIRST VISIT ENDS IN A BUTTON. «Зрозумів» is an acknowledgement, not a consent dialog: it writes the per-viewer
 * key of I-10 and goes home, and every later visit — from «Ще» — is the same page without it. The server's own
 * `first_time.office_sees_read` is the seed's truth; `localStorage` only remembers what THIS viewer did since,
 * inside a try/catch, because a private window that refuses storage must still show the page (I-10).
 *
 * «108 МБ» carries «приклад», like every seeded number on this route (§8.6 #16).
 */
import { type JSX, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check } from 'lucide-react';
import { useToday } from '../../api/hooks';
import { DEVICE_ID, officeSeesKey } from '../../app/device';
import { ActionBar, DriverSkeleton, LightPage, PrimaryAction } from '../../components/driver';
import { ExampleChip } from '../../components/shared';

const TITLE = 'Що бачить офіс';
const GOT_IT = 'Зрозумів';
const TRAFFIC = 'Цього місяця застосунок витратив 108 МБ';

const SECTIONS: readonly { title: string; body: string }[] = [
  { title: 'Що йде в офіс',
    body: 'Фото документів, числа, які ви підтвердили, час. Місце — тільки в момент натискання.' },
  { title: 'Що телефон перевіряє, але не надсилає',
    body: 'Поки ви заповнюєте, телефон перевіряє швидкість — щоб не відволікати в дорозі. В офіс вона не йде.' },
  { title: 'Чого немає',
    body: 'Стеження у фоні, ваші контакти й галерея, звіти про телефон у дорозі, рух між записами.' },
  { title: 'Хто бачить',
    body: 'Диспетчери й оператор КТЛ — ваші записи і фото. Бухгалтер — підтверджені дні.' },
  { title: 'Скільки зберігаємо',
    body: 'Фото в телефоні — 14 днів після «В офісі ✓». В офісі — за правилами КТЛ.' },
  { title: 'Місце', body: 'Дозволено лише під час використання сайту' },
];

/** Per-viewer only, and never load-bearing: a refusal to store reads exactly like a first visit (I-10). */
function seen(): boolean {
  try {
    return window.localStorage.getItem(officeSeesKey(DEVICE_ID)) !== null;
  } catch {
    return false;
  }
}
function remember(): void {
  try {
    window.localStorage.setItem(officeSeesKey(DEVICE_ID), '1');
  } catch {
    /* a viewer who blocks storage simply meets the button again */
  }
}

export function OfficeSeesPage(): JSX.Element {
  const navigate = useNavigate();
  const today = useToday();
  const [read] = useState(seen);
  const data = today.data;
  const first = data !== undefined && !data.first_time.office_sees_read && !read;

  const done = (): void => {
    remember();
    navigate('/', { replace: true });
  };

  return (
    <LightPage
      title={TITLE}
      onBack={() => { navigate('/'); }}
      bar={!first ? undefined : (
        <ActionBar><PrimaryAction icon={Check} verb={GOT_IT} onPress={done} /></ActionBar>
      )}
    >
      {data === undefined ? <DriverSkeleton /> : (
        <>
          {SECTIONS.map((section) => (
            <section key={section.title} className="flex w-full flex-col gap-1">
              <h2 className="text-[1.125rem] leading-[1.5rem] font-semibold">{section.title}</h2>
              <p className="text-[1rem] leading-[1.5rem]" style={{ color: 'var(--text-2)' }}>{section.body}</p>
            </section>
          ))}
          <section className="flex w-full flex-col gap-1">
            <h2 className="text-[1.125rem] leading-[1.5rem] font-semibold">Інтернет</h2>
            <p className="tnum text-[1rem] leading-[1.5rem]" style={{ color: 'var(--text-2)' }}>{TRAFFIC}</p>
            <span><ExampleChip /></span>
          </section>
        </>
      )}
    </LightPage>
  );
}
