// mocks/driver-report/src/pages/office/bas.test.tsx
/** «В BAS» (§4.2 C-11, §8.3 C-11 #1–#4, D8, §1.4 delta 4, beat 11).
 *
 *  ONE DEVIATION from the plan's Step-1 block: the toast is asserted with `screen`, not against a `<Toaster />` this
 *  file renders. While W2-05 was still the W0-18 placeholder this file had to mount its own — a placeholder shell
 *  renders no Toaster, so a toast raised by this page landed in no DOM at all — and scope it with `within`, because
 *  two Toasters render the same record and an unscoped `findByText` then fails on "multiple elements". `ConsoleShell`
 *  has landed and mounts one (W2-05), so the workaround is gone: the assertion now reads the console's own toast,
 *  which is the thing §8.3 C-11 #3 is about.
 *
 *  `cleanup` and `toast.dismiss` are the harness's, registered once for every file that imports it (I-17). */
import { beforeAll, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&user=natalia&stage=1'); });
import { screen, within } from '@testing-library/react';
import { atBeat, renderAt } from '../../test/harness';

beforeAll(() => { URL.createObjectURL = vi.fn(() => 'blob:mock'); URL.revokeObjectURL = vi.fn(); });

describe('«В BAS» (§4.2 C-11, §8.3 C-11, D8, beat 11)', () => {
  it('confesses the mock, counts the fleet, saves a CSV and imports once', async () => {
    await atBeat(11);
    const { container, user } = renderAt('/bas');
    expect(await screen.findByText('Макет: у вашу базу нічого не надсилається')).toBeInTheDocument();
    // findBy, not getBy: the banner is rendered BEFORE the preview resolves (§8.3 C-11 #1 asks for it in every
    // state), so the first await settles while the count line is still a skeleton.
    expect(await screen.findByText('Усі (приклад): підтверджено днів 58 · не підтверджено 6 — не потраплять у файл')).toBeInTheDocument();
    for (const t of ['Подорожні листи · 58', 'Ділянки · 97', 'Заправки · 41', 'Робочий час · 58']) expect(screen.getByRole('tab', { name: t })).toBeInTheDocument();
    // §8.3 C-11 #2, at the width the demo actually runs at: jsdom is 1024 px, so `useConsoleMode` is «compact» and
    // «Ділянки» shows six of its fourteen columns — the stage's own console frame is 946 px and narrower still.
    await user.click(screen.getByRole('tab', { name: 'Ділянки · 97' }));
    expect(await screen.findByText('е-ТТН № 2026-0921-000318 · Вчасно.ТТН · доставлено')).toBeInTheDocument();
    expect(within(container.querySelector('[data-ettn]') as HTMLElement).getByText('приклад')).toBeInTheDocument();
    expect(screen.getByText('Ще 8 колонок у файлі')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Подорожні листи · 58' }));
    expect(await screen.findByText('Ще 9 колонок у файлі')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Завантажити файл/ }));
    expect(screen.queryByText(/XLSX/)).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: 'CSV (;) · Подорожні листи' }));
    expect(await screen.findByText('Файл КТЛ-подорожні-21.09.2026.csv · 58 рядків · збережено')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Імпорт у BAS (імітація)' }));
    expect(await screen.findByText('Створено 58 чернеток · не проведено · проводить бухгалтер')).toBeInTheDocument();
    // «Exported rows gain «У BAS 21.09 16:07 · версія 1»» — by pattern on the version, which is the DAY's and not
    // this page's to pin.
    expect((await screen.findAllByText(/^У BAS 21\.09 16:07 · версія \d+$/)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Імпорт у BAS (імітація)' }));
    expect(await screen.findByText('Уже в BAS без змін 58 · нових 0')).toBeInTheDocument();
    expect(screen.getByText('Макет: у вашу базу нічого не надсилається')).toBeInTheDocument();
  });
});
