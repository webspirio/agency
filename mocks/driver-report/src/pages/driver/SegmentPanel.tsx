// mocks/driver-report/src/pages/driver/SegmentPanel.tsx — a W0-18 placeholder; W2-02 replaces this file in full (I-16).
/** «Що зараз?» is a history-state panel on `/`, not a route; its owner renders it with these props. */
import { PagePlaceholder } from '../PagePlaceholder';

export function SegmentPanel(_props: { stopId: string; onDone(): void }) { return <PagePlaceholder id="D-05" title="Що зараз?" />; }
