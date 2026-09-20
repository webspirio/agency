// mocks/driver-report/src/stage/layout.test.ts
import { describe, expect, it } from 'vitest';
import { stageLayout } from './layout';

const at = (W: number, H: number) => stageLayout({ W, H, viewport: '360x670', focus: 'both', single: 'both', barHidden: false });
describe('stage layouts (§5.2, §8.4 #1–#3)', () => {
  it('1440 × 900: the rehearsal canvas at × 1.0', () => {
    expect(at(1440, 900)).toMatchObject({ mode: 'canvas', k: 1, bar: 40, phone: { x: 24, y: 80, scale: 1.1 }, console: { x: 470, y: 80, w: 946, h: 810 }, scaleLabel: null });
  });
  it('1920 × 1080: the same canvas × 1.2', () => {
    expect(at(1920, 1080)).toMatchObject({ mode: 'canvas', k: 1.2, scaleLabel: null });
  });
  it('1280 × 720: reflow, bar 36, phone 0.875, console 896 × 644 (rail), «Масштаб 88 %»', () => {
    expect(at(1280, 720)).toMatchObject({ mode: 'reflow', bar: 36, phone: { x: 16, y: 64, scale: 0.875 }, console: { x: 368, w: 896, h: 644 }, scaleLabel: 'Масштаб 88 %' });
  });
  it('1536 × 864: reflow with a compact console', () => {
    const l = at(1536, 864);
    // oxlint-disable-next-line agency/no-float-arithmetic -- 784/736 read to three decimals: a screen scale, not money
    expect([l.mode, l.bar, Math.round(l.phone.scale * 1000), l.console.w, l.console.h]).toEqual(['reflow', 40, 1065, 1079, 784]);
  });
  it('switches to one pane when the phone would fall below 0.8', () => {
    expect(at(1100, 600).mode).toBe('single');
  });
});
