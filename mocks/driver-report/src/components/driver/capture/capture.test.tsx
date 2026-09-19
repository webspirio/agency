// mocks/driver-report/src/components/driver/capture/capture.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=driver&device=device-000001&stage=1'); });
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { engineFor } from '../../../app/capture/engine';
import { looksDuplicate } from '../../../app/capture/similarity';
import { demo } from '../../../domain/clock';
import { CameraScreen, ExampleCard, NoDocumentPage, NoPhotoScreen, ReviewGrid, ReviewSingle } from './index';

// No globals in either vitest config, so Testing Library's auto-cleanup guard (`typeof afterEach === 'function'`) is
// false and nothing unmounts between `it`s: without this line the review grid below counts the review screen's own
// «Перезняти», and a duplicate found there is a false green. Same reason as src/components/driver/chrome.test.tsx:13.
afterEach(cleanup);

const onCall = { name: 'Ірина Коваленко', role_label: 'диспетчер', until: '20:00', phone: '+380 67 214 55 08' };
const page = (variant: string, quality: 'OK' | 'LOW' = 'OK') => ({ artefact: 'TTN_FRONT' as const, doc_index: 1, page_no: 1, captured_at: demo('08:57'),
  source: 'DRAWN' as const, bytes: 300000, quality, quality_reasons: [], deferred: null, drawn: { variant, value: null, sim_read: null }, image: null });

describe('the camera (§3.3 D-06, §8.2 D-06, D4)', () => {
  it('is dark, names the page, frames it A4, confesses the drawing and never asks for the camera', async () => {
    const gum = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gum }, configurable: true });
    const onShot = vi.fn();
    const { container } = render(<CameraScreen title="ТТН 1 з 2 — лицьовий бік" hint="ТТН на сидіння, весь аркуш у рамці" artefact="TTN_FRONT"
      counter={{ index: 0, total: 4 }} row2={['NO_DOC', 'AT_PARKING']} engine="DRAWN" drawn={{ artefact: 'TTN_FRONT', doc_index: 1, page_no: 1, variant: 'ttn-004517-front', value: null, sim_read: null }}
      onBack={() => {}} onShot={onShot} onRow2={() => {}} />);
    expect(container.querySelector('[data-surface="dark"]')).not.toBeNull();
    expect(container.querySelector('[data-frame="A4"]')).not.toBeNull();
    for (const t of ['ТТН 1 з 2 — лицьовий бік', 'Макет: намальоване фото', 'Фото — для контролю. Оригінал здайте в офіс.', 'Немає документа', 'Зніму на стоянці', '1 з 4']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    const shutter = screen.getByRole('button', { name: 'Зняти' });
    await userEvent.dblClick(shutter);
    expect(onShot).toHaveBeenCalledTimes(1);
    expect(gum).not.toHaveBeenCalled();
  });

  // Beyond the plan's case: what the one shot HANDS BACK, which is the whole point of the screen, and the frame the
  // cluster gets — the two shapes §3.3 D-06 names that the assertions above cannot see.
  it('hands back a drawn page with the artefact’s own size, and frames the cluster wide with no framing line', async () => {
    const onShot = vi.fn();
    const { container, rerender } = render(<CameraScreen title="Сфотографуйте щиток" hint="Щиток цілком — цифри і паливо" artefact="CLUSTER"
      row2={[]} engine="DRAWN" drawn={{ artefact: 'CLUSTER', doc_index: 1, page_no: 1, variant: 'cluster:412398', value: '412398', sim_read: '412398' }}
      onBack={() => {}} onShot={onShot} onRow2={() => {}} />);
    expect(container.querySelector('[data-frame="CLUSTER"]')).not.toBeNull();
    expect(screen.queryByText('Фото — для контролю. Оригінал здайте в офіс.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Зняти' }));
    expect(onShot).toHaveBeenCalledWith(expect.objectContaining({ artefact: 'CLUSTER', source: 'DRAWN', bytes: 200000,
      quality: 'OK', quality_reasons: [], deferred: null, image: null, drawn: { variant: 'cluster:412398', value: '412398', sim_read: '412398' } }));
    // The shutter is armed again by the next title, not by time (§3.3 D-06).
    rerender(<CameraScreen title="Сфотографуйте чек" hint="Чек цілком, з QR-кодом" artefact="RECEIPT"
      row2={['LATER']} engine="DRAWN" drawn={{ artefact: 'RECEIPT', doc_index: 1, page_no: 1, variant: 'receipt-okko-58213', value: null, sim_read: null }}
      onBack={() => {}} onShot={onShot} onRow2={() => {}} />);
    expect(container.querySelector('[data-frame="RECEIPT"]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Зняти' }));
    expect(onShot).toHaveBeenCalledTimes(2);
  });

  // The numbering the office reads back. `doc_index`/`page_no` build the office's caption («ТТН 2 з 2, зворотний»,
  // domain/exceptions.ts) and the retake request that names one page of four (§3.3 D-13, §4.2 C-02). The camera is
  // shown one page and cannot derive the pair — but the drawn spec it is already handed carries it, straight from the
  // script, so a flow that forgets to renumber still commits the right pages.
  it('numbers the page it hands back from the drawn spec, not 1 of 1', async () => {
    const onShot = vi.fn();
    render(<CameraScreen title="ТТН 2 з 2 — зворотний бік" hint="ТТН на сидіння, весь аркуш у рамці" artefact="TTN_BACK"
      row2={[]} engine="DRAWN" drawn={{ artefact: 'TTN_BACK', doc_index: 2, page_no: 2, variant: 'ttn-004518-back:soft', value: null, sim_read: null }}
      onBack={() => {}} onShot={onShot} onRow2={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Зняти' }));
    expect(onShot).toHaveBeenCalledWith(expect.objectContaining({ artefact: 'TTN_BACK', doc_index: 2, page_no: 2 }));
  });

  it('falls back to 1 of 1 when nothing is drawn, so an unscripted shot is still a whole page', async () => {
    const onShot = vi.fn();
    render(<CameraScreen title="Сфотографуйте щиток" hint="Щиток цілком — цифри і паливо" artefact="CLUSTER"
      row2={[]} engine="DRAWN" drawn={null} onBack={() => {}} onShot={onShot} onRow2={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Зняти' }));
    expect(onShot).toHaveBeenCalledWith(expect.objectContaining({ doc_index: 1, page_no: 1 }));
  });

  it('names a second row button by its own word and reports it', async () => {
    const onRow2 = vi.fn();
    render(<CameraScreen title="ТТН 2 з 2 — зворотний бік" hint="ТТН на сидіння, весь аркуш у рамці" artefact="TTN_BACK"
      row2={['NO_MORE_TTN', 'AT_PARKING']} engine="DRAWN" drawn={null} onBack={() => {}} onShot={() => {}} onRow2={onRow2} />);
    await userEvent.click(screen.getByRole('button', { name: 'Більше ТТН немає' }));
    expect(onRow2).toHaveBeenCalledWith('NO_MORE_TTN');
  });
});

describe('the engine the stage may never choose (D4, §8.6 #14)', () => {
  it('draws on the stage and on a mouse, and only ever films a touch device with a camera', () => {
    expect(engineFor({ stage: true, touch: true, camera: true })).toBe('DRAWN');
    expect(engineFor({ stage: false, touch: false, camera: true })).toBe('DRAWN');
    expect(engineFor({ stage: false, touch: true, camera: false })).toBe('DRAWN');
    expect(engineFor({ stage: false, touch: true, camera: true })).toBe('INPAGE');
  });
});

describe('reviews (§3.3 D-06, §8.2 D-06 #4)', () => {
  it('reviews one page, and a low one leads with «Перезняти»', () => {
    const { rerender } = render(<ReviewSingle page={page('receipt-okko-58213')} onOk={() => {}} onRetake={() => {}} />);
    expect(screen.getByText('знято 08:57 · 0,3 МБ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добре' })).toHaveAttribute('data-accent');
    rerender(<ReviewSingle page={page('x', 'LOW')} onOk={() => {}} onRetake={() => {}} onKeep={() => {}} />);
    expect(screen.getByText('Нечітко видно')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перезняти' })).toHaveAttribute('data-accent');
    expect(screen.getByRole('button', { name: 'Залишити так' })).toBeInTheDocument();
  });
  it('reviews four pages in a grid with the add chips and flags a duplicate', () => {
    render(<ReviewGrid pages={[page('a'), page('b'), page('c'), page('c')]} add={['MORE_TTN', 'PAGE', 'TICKET']} onOk={() => {}} onRetake={() => {}} onAdd={() => {}} />);
    expect(screen.getByText('Перевірте: 4 сторінки')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Перезняти' })).toHaveLength(4);
    for (const t of ['+ Ще ТТН', '+ Сторінка', '+ Талон з ваг', 'Добре, все видно']) expect(screen.getByRole('button', { name: t })).toBeInTheDocument();
    expect(screen.getAllByText('Схоже, та сама сторінка двічі')).toHaveLength(2);
  });

  // Beyond the plan's two: the grid's own report of WHICH tile to retake, and the duplicate rule underneath the chip.
  it('retakes the tile that was pressed, and calls a page a duplicate only of its own twin', async () => {
    const onRetake = vi.fn();
    render(<ReviewGrid pages={[page('a'), page('b'), page('c'), page('c')]} add={['MORE_TTN']} onOk={() => {}} onRetake={onRetake} onAdd={() => {}} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Перезняти' })[2]!);
    expect(onRetake).toHaveBeenCalledWith(2);
    expect(looksDuplicate(page('c'), page('c'))).toBe(true);
    expect(looksDuplicate(page('a'), page('b'))).toBe(false);
  });
});

describe('«Немає документа» (§3.3 D-06, §8.6 #11)', () => {
  it('warns about the fine before recording a loading without ТТН', async () => {
    const onReason = vi.fn();
    render(<NoDocumentPage artefact="TTN_FRONT" onReason={onReason} onBack={() => {}} onCall={onCall} />);
    await userEvent.click(screen.getByRole('button', { name: 'Відправник не дав ТТН' }));
    // The rendered sentence carries U+00A0 in «17 000»; the matcher must not, because Testing Library normalises the
    // node and never the matcher (measured in this mock).
    expect(screen.getByText('Без ТТН не виїжджайте — за це штраф 17 000 грн. Подзвоніть диспетчеру.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Записати без ТТН' }));
    expect(onReason).toHaveBeenCalledWith('SHIPPER_REFUSED');
  });

  // Beyond the plan's case: the other two artefacts' rows, each of which is a §7.5 reason code a Wave 2 flow commits.
  it('asks the signed ТТН’s own five questions, and the weigh ticket its one', async () => {
    const onReason = vi.fn();
    const { rerender } = render(<NoDocumentPage artefact="TTN_SIGNED" onReason={onReason} onBack={() => {}} onCall={onCall} />);
    for (const t of ['Одержувач не підписує', 'ТТН лишилась у одержувача', 'Підпишуть пізніше', 'Електронна ТТН', 'Подзвоніть мені']) {
      expect(screen.getByRole('button', { name: t })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole('button', { name: 'Підпишуть пізніше' }));
    expect(onReason).toHaveBeenCalledWith('SIGN_LATER');
    rerender(<NoDocumentPage artefact="WEIGH_TICKET" onReason={onReason} onBack={() => {}} onCall={onCall} />);
    expect(screen.getByRole('button', { name: 'Талона не дали' })).toBeInTheDocument();
  });
});

describe('the two screens that replace a photo (§3.3 D-06)', () => {
  it('offers the after-exit capture where photographs are forbidden', async () => {
    const onDefer = vi.fn();
    render(<NoPhotoScreen onDefer={onDefer} onShootAnyway={() => {}} />);
    expect(screen.getByText('Тут фото заборонені')).toBeInTheDocument();
    expect(screen.getByText('ТТН з підписом і щиток знімете після виїзду')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Все одно зняти зараз' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Зніму після виїзду' }));
    expect(onDefer).toHaveBeenCalledOnce();
  });
  it('shows «Ось так» once, with the example and one way out', async () => {
    const onOk = vi.fn();
    render(<ExampleCard artefact="TTN_BACK" hint="Потрібен бік з часом прибуття і підписом" onOk={onOk} />);
    expect(screen.getByText('Ось так')).toBeInTheDocument();
    expect(screen.getByText('Потрібен бік з часом прибуття і підписом')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Зрозумів' }));
    expect(onOk).toHaveBeenCalledOnce();
  });
});
