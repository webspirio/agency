// mocks/driver-report/src/components/artefacts/index.ts
/** The drawn documents of §6.11 (I-15 «artefacts»). A screen names a variant; this kit decides what it looks like. */
export { Artefact, type ArtefactSize } from './Artefact';
export { ClusterArt } from './ClusterArt';
export { SeatBackdrop } from './SeatBackdrop';
export { artefactKindOf, parseVariant, planFor } from './catalogue';
export type { ActPaper, ArtefactPlan, ReceiptPaper, TicketPaper, TtnPaper, TtnPrint, Variant } from './catalogue';
