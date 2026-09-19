// mocks/driver-report/src/app/capture/drawnPlan.test.ts
import { describe, expect, it } from 'vitest';
import { drawnFor } from './drawnPlan';

const P = 'device-000001';
const O = 'device-000002';
const H = 'device-000003';

describe('the drawn artefacts the stage viewfinder shows (§3.3 D-07, D-08, D-10, §6.11)', () => {
  it('shows Павло’s four loading pages, the last one smudged', () => {
    expect(drawnFor({ deviceId: P, flow: 'loaded', stopPlanKey: '3312-1', expectedKm: null, retake: null }).map((d) => d.variant))
      .toEqual(['ttn-004517-front', 'ttn-004517-back', 'ttn-004518-front', 'ttn-004518-back:soft']);
  });
  it('shows the receipt and then the cluster at the expected reading', () => {
    expect(drawnFor({ deviceId: P, flow: 'refuel', stopPlanKey: null, expectedKm: 412398, retake: null }))
      .toEqual([{ artefact: 'RECEIPT', doc_index: 1, page_no: 1, variant: 'receipt-okko-58213', value: null, sim_read: null },
        { artefact: 'CLUSTER', doc_index: 1, page_no: 1, variant: 'cluster:412398', value: '412398', sim_read: '412398' }]);
  });
  it('reads 412 866 on the «Лан» cluster so the digit question appears', () => {
    expect(drawnFor({ deviceId: P, flow: 'later', stopPlanKey: '3312-3', expectedKm: 412566, retake: null })[1])
      .toEqual({ artefact: 'CLUSTER', doc_index: 1, page_no: 1, variant: 'cluster:412566', value: '412566', sim_read: '412866' });
  });
  it('retakes the clean page', () => {
    expect(drawnFor({ deviceId: P, flow: 'retake', stopPlanKey: '3312-1', expectedKm: null, retake: { artefact: 'TTN_BACK', doc_index: 2, page_no: 2 } })[0]!.variant)
      .toBe('ttn-004518-back');
  });

  // Beyond the plan's four: the three rules its cases do not reach — the other two phones, and the cluster a step
  // photographs where the script authored nothing. Each of these is a Wave 2 flow (D-03, D-04, D-08, D-14).
  it('shows Олег’s one ТТН and Григорій’s own numbers, never Павло’s', () => {
    expect(drawnFor({ deviceId: O, flow: 'loaded', stopPlanKey: '3313-1', expectedKm: null, retake: null }).map((d) => d.variant))
      .toEqual(['ttn-004533-front', 'ttn-004533-back']);
    expect(drawnFor({ deviceId: H, flow: 'unloaded', stopPlanKey: '3317-2', expectedKm: null, retake: null }).map((d) => d.variant))
      .toEqual(['ttn-004671-signed']);
  });
  it('draws the cluster at the expected reading on a step the script never took', () => {
    expect(drawnFor({ deviceId: H, flow: 'arrive', stopPlanKey: '9999-1', expectedKm: 356400, retake: null }))
      .toEqual([{ artefact: 'CLUSTER', doc_index: 1, page_no: 1, variant: 'cluster:356400', value: '356400', sim_read: '356400' }]);
  });
  it('shows a cluster with no number at all when nothing is expected (D6)', () => {
    // device-000009 is the revoked phone: the script never photographs anything on it, so there is no authored
    // reading to fall back on and no expected one either.
    expect(drawnFor({ deviceId: 'device-000009', flow: 'shift-end', stopPlanKey: null, expectedKm: null, retake: null }))
      .toEqual([{ artefact: 'CLUSTER', doc_index: 1, page_no: 1, variant: 'cluster:000000', value: null, sim_read: null }]);
  });
  it('has nothing to draw for a flow that photographs nothing', () => {
    expect(drawnFor({ deviceId: P, flow: 'stand', stopPlanKey: null, expectedKm: null, retake: null })).toEqual([]);
  });

  // ── The numbering the office reads back (§3.3 D-13, §4.2 C-02) ─────────────
  // `doc_index`/`page_no` decide the office's caption («ТТН 2 з 2, зворотний», domain/exceptions.ts), and the script
  // already states them for every page it photographs. A spec that dropped them would force each of four Wave 2 flows
  // to re-derive the pair by hand, with nothing red when one of them got it wrong.
  it('carries the script’s own page numbering on every drawn loading page', () => {
    expect(drawnFor({ deviceId: P, flow: 'loaded', stopPlanKey: '3312-1', expectedKm: null, retake: null })
      .map((d) => [d.doc_index, d.page_no]))
      .toEqual([[1, 1], [1, 2], [2, 1], [2, 2]]);
  });
  it('numbers a retake as the page the office asked for, not as the first of one', () => {
    expect(drawnFor({ deviceId: P, flow: 'retake', stopPlanKey: '3312-1', expectedKm: null,
      retake: { artefact: 'TTN_BACK', doc_index: 2, page_no: 2 } })[0])
      .toMatchObject({ doc_index: 2, page_no: 2 });
  });
  it('numbers a lone cluster 1 of 1', () => {
    expect(drawnFor({ deviceId: P, flow: 'refuel', stopPlanKey: null, expectedKm: 412398, retake: null })[1])
      .toMatchObject({ doc_index: 1, page_no: 1 });
  });
});
