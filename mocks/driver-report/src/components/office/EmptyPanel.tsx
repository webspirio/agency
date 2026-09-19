// mocks/driver-report/src/components/office/EmptyPanel.tsx
/** The dashed `empty-slot` with what is TRUE and what happens NEXT (§4.1 «Empty»).
 *
 *  Two sentences, never one: «Нічого немає» is a dead end, «Порожньо · нові записи з'являться тут самі» tells the
 *  clerk whether to wait or to act. The dash is the same `empty-slot` utility the driver's trip rail uses for a
 *  stop that has not happened yet, so an absence looks the same on both sides of the product. */
import type { JSX } from 'react';

export function EmptyPanel({ title, hint }: { title: string; hint: string }): JSX.Element {
  return (
    <div className="empty-slot flex flex-col items-center justify-center gap-[6px] px-[24px] py-[40px] text-center">
      <p className="text-[15px] leading-[1.35] font-semibold text-ink">{title}</p>
      <p className="max-w-[56ch] text-[13px] leading-[1.5] text-text-2">{hint}</p>
    </div>
  );
}
