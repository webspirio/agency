// mocks/driver-report/src/pages/office/TruckPage.tsx
/** C-13 «Машина → Пальне» (§4.2 C-13, §8.3 C-12/C-13 #2).
 *
 *  One truck, three tabs: «Місяць» (the day strip and the C-12 figures), «Пальне» (four sourced cells, what does not
 *  reconcile, and the norm) and «Ключові точки» (C-10 filtered to this truck). `/trucks/:truckId/fuel` is a real route
 *  so the tab a row opens into survives a paste into a chat — the deep link decides the first tab, and the tab then
 *  lives in this component, which is why switching it does not push a history entry the office has to walk back out
 *  of one by one.
 *
 *  The header IS `PageHead`: §4.2 C-13 makes the plate itself the heading, and `PageHead.title` takes a `ReactNode`
 *  (widened at the Wave 2 round gate on this task's integrator note), so the `Plate` goes into the `<h1>` the kit
 *  already owns. The local copy of that header this page carried while `title` was a `string` is gone — a second
 *  console page header living in a page is the drift `PageHead` exists to prevent. The plate's `role="img"` carries
 *  «Номер АР 8150 КС», so a heading made of one still reads out as words (§8.5).
 *
 *  `TRUCK_NOT_FOUND` is branched on the CODE and nothing else (HARD RULE 5), through `codeOf` and `SAYS_TRUCK`. */
import { useState, type JSX } from 'react';
import { useLocation, useParams } from 'react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@agency/kit/tabs';
import { EmptyPanel, PageHead, Panel, SkeletonRows, useConsoleMode } from '../../components/office';
import { Plate } from '../../components/shared';
import { useScope, useServerNow } from '../../app/live';
import { fmtDay } from '../../app/format';
import { codeOf } from '../../api/contract';
import { SAYS_TRUCK } from '../../api/says';
import { useKeyPoints, useTruckFuel } from '../../api/hooks';
import { businessDate } from '../../domain/clock';
import { KeyPointsTable } from './KeyPointsPage';
import { FuelTab } from './trucks/FuelTab';
import { MonthStrip } from './trucks/MonthStrip';

type Tab = 'month' | 'fuel' | 'key-points';
const BACK = { label: 'Машини', to: '/trucks' };

export function TruckPage(): JSX.Element {
  const { truckId = '' } = useParams();
  const { pathname } = useLocation();
  const mode = useConsoleMode();
  const scope = useScope();
  const today = businessDate(useServerNow(60_000));
  const month = today.slice(0, 7);
  // The deep link chooses the first tab; after that the tab is this component's, not the router's.
  const [tab, setTab] = useState<Tab>(() => (pathname.endsWith('/fuel') ? 'fuel' : 'month'));

  const fuel = useTruckFuel(truckId, month);
  const points = useKeyPoints(today, scope, truckId);

  if (fuel.isError && codeOf('getTruckFuel', fuel.error) === 'TRUCK_NOT_FOUND') {
    return (
      <>
        <PageHead title="Машина" back={BACK} />
        <EmptyPanel title={SAYS_TRUCK.TRUCK_NOT_FOUND} hint="Відкрийте «Машини» і виберіть машину зі списку." />
      </>
    );
  }

  const view = fuel.data;
  return (
    <>
      <PageHead
        back={BACK}
        title={view === undefined ? null : <Plate plate={view.truck.plate} size="lg" />}
        description={view?.truck.line}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="month">Місяць</TabsTrigger>
          <TabsTrigger value="fuel">Пальне</TabsTrigger>
          <TabsTrigger value="key-points">Ключові точки</TabsTrigger>
        </TabsList>

        <TabsContent value="month">
          <Panel>
            {view === undefined ? <SkeletonRows /> : <MonthStrip strip={view.month_strip} month={view.month} />}
          </Panel>
        </TabsContent>

        <TabsContent value="fuel">
          {view === undefined ? <Panel><SkeletonRows /></Panel> : <FuelTab view={view} />}
        </TabsContent>

        <TabsContent value="key-points">
          <Panel hint={fmtDay(today)}>
            {points.isPending
              ? <SkeletonRows />
              : <KeyPointsTable rows={points.data?.data ?? []} mode={mode} />}
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}
