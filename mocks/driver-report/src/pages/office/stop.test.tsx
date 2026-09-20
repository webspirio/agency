// mocks/driver-report/src/pages/office/stop.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => { vi.stubEnv('VITE_MOCK', '1'); window.history.replaceState(null, '', '/?profile=dispatcher&user=natalia&stage=1'); });
import { act, cleanup, screen } from '@testing-library/react';
import { call } from '../../api/contract';
import { server } from '../../api/server';
import { NATALIA } from '../../domain/script';
import { atBeat, renderAt, transportAs } from '../../test/harness';

const width = (w: number) => act(() => { window.innerWidth = w; window.dispatchEvent(new Event('resize')); });
afterEach(cleanup);

const dk = () => server.world().plannedStops.find((p) => p.plan_key === '3312-1')!.id;

describe('confirm instead of re-typing (§4.2 C-04, §8.3 C-04, beat 5)', () => {
  it('accepts the printed fields, types the arrival, zooms the cell, asks for a retake', async () => {
    width(1440);
    await atBeat(5);
    const { user, container } = renderAt(`/stop/${dk()}`);
    expect(await screen.findByText('Вільнянськ · завантаження · АР 1234 ВС · 21.09')).toBeInTheDocument();
    expect(screen.getByText('на перевірці')).toBeInTheDocument();
    expect(screen.getByText('OCR: 004517 · з фото — перевірте')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Прийняти друковані/ }));
    expect(await screen.findAllByText('OCR · підтвердила Н. Шевчук 08:42')).not.toHaveLength(0);
    const arrival = screen.getByLabelText('Прибуття');
    await user.click(arrival);
    expect(container.querySelector('[data-zoom-inset]')).not.toBeNull();
    await user.type(arrival, '0748{Enter}');
    expect(await screen.findByText('Прибуття за ТТН 07:48 · водій на місці з 06:10 → до відмітки 1 год 38 хв · не простій за Правилами (п.8.25), лише за договором')).toBeInTheDocument();
    const retakeButtons = screen.getAllByRole('button', { name: 'Попросити перезняти' });
    await user.click(retakeButtons[3]!);
    expect(screen.queryByText('Не видно підпису')).toBeNull();
    const send = screen.getByRole('button', { name: 'Надіслати водію' });
    expect(send).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Розмито' }));
    await user.click(send);
    expect(await screen.findByText(/надіслано 08:42/)).toBeInTheDocument();
  });
  it('tells a second request who asked, when and how far it got (§8.3 C-06 #2)', async () => {
    await atBeat(5);
    const key = server.scriptRefs['S-10']!;
    await call(transportAs(NATALIA, ['dispatcher']), 'createRequest', { params: {}, body: { type: 'RETAKE_PHOTO', record_key: key, page_key: `${key}:p4`, reasons: ['BLUR'] } });
    const { user } = renderAt(`/stop/${dk()}`);
    await user.click((await screen.findAllByRole('button', { name: 'Попросити перезняти' }))[3]!);
    await user.click(screen.getByRole('button', { name: 'Розмито' }));
    await user.click(screen.getByRole('button', { name: 'Надіслати водію' }));
    expect(await screen.findByText('Уже запитано: Н. Шевчук 08:42 · надіслано')).toBeInTheDocument();
  });
  it('says so for an unknown stop', async () => {
    await atBeat(5);
    renderAt('/stop/stop-999999');
    expect(await screen.findByText('Цю зупинку не знайдено — можливо, водій скасував запис.')).toBeInTheDocument();
  });
});
