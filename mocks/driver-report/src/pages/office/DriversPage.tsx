// mocks/driver-report/src/pages/office/DriversPage.tsx
/**
 * «Водії» (§4.2 C-16) — who drives, on what, and whether the phone in his pocket is talking to this product.
 *
 * The «Телефон» column is the whole point of the page: «Android 11 · Chrome · підключено 01.09» is a driver the
 * office can ask for a photo, «не підключено» is one it still has to call, and «смартфона немає» is one who will
 * always be on paper. That single column is what turns a staff list into a rollout plan.
 *
 * THE CARD IS A ROUTE, NOT A STATE. `?open=:id` opens it (§2.3), so the sheet a dispatcher is looking at survives a
 * reload and can be pasted into a chat — and the console's own «Картка водія» menu item on «Парк зараз» (W2-05) can
 * link straight to it without this page exporting anything.
 */
import type { JSX } from 'react';
import { useSearchParams } from 'react-router';
import { useDrivers } from '../../api/hooks';
import { useScope } from '../../app/live';
import { colW, EmptyPanel, PageHead, Panel, ResponsiveTable, SkeletonRows, useConsoleMode,
  type RTColumn } from '../../components/office';
import { ExampleChip, Plate } from '../../components/shared';
import type { DriverRow } from '../../domain/dto';
import { DriverCard } from './drivers/DriverCard';

const TITLE = 'Водії';
const MODE: Record<DriverRow['mode'], string> = { APP: 'Застосунок', PAPER: 'Папір' };
const YES = 'так';
const NONE = '—';

export function DriversPage(): JSX.Element {
  const mode = useConsoleMode();
  const scope = useScope();
  const list = useDrivers(scope);
  const [params, setParams] = useSearchParams();

  const rows = list.data?.data ?? [];
  const openId = params.get('open');
  const open = openId === null ? null : (rows.find((r) => r.id === openId) ?? null);

  // §4.2 C-16's six columns and their shares: 1 136 with the chevron at wide, 690 below it, against the panes
  // `fit.test.tsx` holds every console list to. «Таб. №» joins «Пілот» under the name below wide — both are facts
  // about the person, and a four-column list of people is what fits 690 px.
  const columns: RTColumn<DriverRow>[] = [
    { id: 'driver', header: 'Водій', width: colW(mode, { wide: 240, narrow: 170 }), cell: (r) => (
      <span className="flex items-center gap-[8px]">
        <span className="text-[14px] font-medium text-ink">{r.full_name}</span>
        {r.example ? <ExampleChip /> : null}
      </span>
    ) },
    { id: 'tab', header: 'Таб. №', width: 96, hideAt: ['compact', 'rail'], mergeInto: 'driver',
      cell: (r) => <span className="font-mono text-[14px] text-text-2">{r.tab_no}</span>,
      mergedCell: (r) => <span className="font-mono text-[13px] text-text-2">{`таб. № ${r.tab_no}`}</span> },
    { id: 'truck', header: 'Машина', width: colW(mode, { wide: 140, narrow: 120 }),
      cell: (r) => (r.plate === NONE ? <span className="text-[14px] text-text-2">{NONE}</span> : <Plate plate={r.plate} size="sm" />) },
    { id: 'mode', header: 'Режим', width: colW(mode, { wide: 130, narrow: 110 }),
      cell: (r) => <span className="text-[14px] text-ink">{MODE[r.mode]}</span> },
    { id: 'phone', header: 'Телефон', width: colW(mode, { wide: 400, narrow: 250 }),
      cell: (r) => <span className="text-[14px] text-text-2">{r.phone_label}</span> },
    { id: 'pilot', header: 'Пілот', width: 90, hideAt: ['compact', 'rail'], mergeInto: 'driver',
      cell: (r) => <span className="text-[14px] text-ink">{r.pilot ? YES : NONE}</span>,
      mergedCell: (r) => <span className="text-[13px] text-text-2">{`пілот: ${r.pilot ? YES : NONE}`}</span> },
  ];

  return (
    <>
      <PageHead title={TITLE} />
      <Panel>
        {list.data === undefined ? <SkeletonRows rows={4} /> : (
          <ResponsiveTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            mode={mode}
            onOpen={(r) => { setParams({ open: r.id }); }}
            empty={(
              <EmptyPanel
                title="Водіїв ще немає"
                hint="Водії з'являться тут із вашої бази — разом з машиною, на якій кожен їздить."
              />
            )}
            card={(r) => (
              <div className="flex flex-col gap-[4px]">
                <span className="flex items-center gap-[8px]">
                  <p className="text-[14px] font-medium text-ink">{r.full_name}</p>
                  {r.example ? <ExampleChip /> : null}
                </span>
                <p className="text-[13px] text-text-2">{`${r.tab_no} · ${r.plate} · ${MODE[r.mode]}`}</p>
                <p className="text-[13px] text-text-2">{r.phone_label}</p>
              </div>
            )}
          />
        )}
      </Panel>
      {open === null ? null : (
        <DriverCard driver={open} onClose={() => { setParams({}, { replace: true }); }} />
      )}
    </>
  );
}
