// mocks/driver-report/src/pages/office/BasPage.tsx
/** «В BAS» (C-11, §4.2, §8.3 C-11 #1–#4, D8, §1.4 delta 4, beat 11).
 *
 *  The page whose whole job is to say what it is NOT doing. BAS stays; nothing here writes to anybody's base; the
 *  four sheets are a FILE, and «Імпорт у BAS (імітація)» simulates the step a bookkeeper performs inside BAS
 *  afterwards. So `MockBanner` is rendered before any early return — it is on screen while the preview is still
 *  loading and while it is refetching, which is what §8.3 C-11 #1 («visible on every state») actually asks for.
 *
 *  D8 is a subtraction, not a setting: there is no XLSX item, because no XLSX writer was built and no library may be
 *  added (HARD RULE 6). A disabled «XLSX» item would be a promise in front of a client; an absent one is a decision.
 *
 *  Nothing on this page formats a number or builds a file. `getExportPreview` answers with the four `SheetView`s
 *  already dealt into cells, and `createExport` answers with the finished bytes plus their file name and row count —
 *  so `saveFile` is handed a string and the toast is handed `OC.toastSaved(file_name, rows)`. The CSV's BOM, its `;`
 *  and its CRLF are properties of those bytes and live in `src/domain/export.ts`, where a test can read them, rather
 *  than in a click handler where only a human with Excel could.
 *
 *  The scope is the CONSOLE's global one (`server.ui.scope`, D13), not a page filter: beat 10 switches it once and
 *  beats 10–12 stay there, so the Segmented here and the one in the header are two views of one value. The date is
 *  `?date=`, defaulting to the SERVER's business date — never a literal, because the demo's «today» is the stage
 *  clock's and a hard-coded 21.09 would contradict a rewound stage on the same screen. */
import { useState, type JSX } from 'react';
import { useSearchParams } from 'react-router';
import { asBusinessDate } from '@agency/mock';
import { Button } from '@agency/kit/button';
import { DateStepper } from '@agency/kit/date-stepper';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@agency/kit/dropdown-menu';
import { Segmented } from '@agency/kit/segmented';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@agency/kit/tabs';
import { toast } from '@agency/kit/toast';
import { Download, Upload } from 'lucide-react';
import { codeOf } from '../../api/contract';
import { useCreateExport, useExportPreview, useImportExport } from '../../api/hooks';
import { SAYS_EXPORT } from '../../api/says';
import { fmtDate, fmtTime } from '../../app/format';
import { setScope, useScope, useServerValue } from '../../app/live';
import { MockBanner, PageHead, Panel, saveFile, SkeletonRows, useConsoleMode } from '../../components/office';
import { ExampleChip } from '../../components/shared';
import { OC } from '../../copy/office';
import { addDays, businessDate } from '../../domain/clock';
import type { CreateExportIn, ExportPreview, SheetView } from '../../domain/dto';
import type { BusinessDate, Scope } from '../../domain/types';
import { SheetTable } from './bas/SheetTable';

const DESCRIPTION = 'BAS лишається. Підтверджені дні йдуть файлом: подорожні, ділянки, заправки й години водіїв — '
  + 'у кожного числа джерело.';

/** A hand-typed `?date=` must not blank the page, and `asBusinessDate` throws on anything that is not a date. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'PILOT', label: 'Пілот' },
  { value: 'FLEET', label: 'Усі (приклад)' },
];

/** D8: CSV (;) per sheet and JSON for all four. «XLSX · усі 4 аркуші» is absent because it was not built. */
const FILES: { label: string; sheet: CreateExportIn['sheet']; format: CreateExportIn['format'] }[] = [
  { label: 'CSV (;) · Подорожні листи', sheet: 'WAYBILLS', format: 'CSV' },
  { label: 'CSV (;) · Ділянки', sheet: 'LEGS', format: 'CSV' },
  { label: 'CSV (;) · Заправки', sheet: 'REFUELS', format: 'CSV' },
  { label: 'CSV (;) · Робочий час', sheet: 'WORKTIME', format: 'CSV' },
  { label: 'JSON · усі 4 аркуші', sheet: 'ALL', format: 'JSON' },
];

const TABS = ['WAYBILLS', 'LEGS', 'REFUELS', 'WORKTIME'] as const;
type SheetKey = (typeof TABS)[number];

/** The view's own `title` and `total` are the tab's label, so a tab count and its table can never disagree. */
function viewOf(preview: ExportPreview, key: SheetKey): SheetView {
  if (key === 'WAYBILLS') return preview.sheets.waybills;
  if (key === 'LEGS') return preview.sheets.legs;
  if (key === 'REFUELS') return preview.sheets.refuels;
  return preview.sheets.worktime;
}

export function BasPage(): JSX.Element {
  const mode = useConsoleMode();
  const today = useServerValue((s) => businessDate(s.clock.nowIso()));
  const scope = useScope();
  const [params, setParams] = useSearchParams();
  const asked = params.get('date');
  const date: BusinessDate = asked !== null && ISO_DATE.test(asked) ? asBusinessDate(asked) : today;
  const [sheet, setSheet] = useState<SheetKey>('WAYBILLS');

  const preview = useExportPreview(date, scope);
  const createExport = useCreateExport();
  const importExport = useImportExport();
  const data = preview.data;

  const goDate = (next: BusinessDate): void => {
    setParams(next === today ? {} : { date: next }, { replace: true });
  };

  /** One menu item: make the file, hand its bytes to the browser, say which file and how many rows (§4.2 C-11). */
  const download = (file: (typeof FILES)[number]): void => {
    createExport.mutate(
      { date, scope, sheet: file.sheet, format: file.format },
      {
        onSuccess: (made) => {
          saveFile(made.file_name, made.mime, made.content);
          // translate="no": a browser's auto-translation rewrites «КТЛ-подорожні-21.09.2026.csv» mid-demo (EC-171).
          toast(<span translate="no">{OC.toastSaved(made.file_name, made.rows)}</span>);
        },
      },
    );
  };

  /** «Імпорт у BAS (імітація)» imports the last file of this date and scope; with none, it makes the waybills CSV
   *  first — and does NOT save it, because the office asked to import, not to download. */
  const runImport = (): void => {
    const id = data?.last_export_id ?? null;
    if (id !== null) {
      importExport.mutate({ id });
      return;
    }
    createExport.mutate(
      { date, scope, sheet: 'WAYBILLS', format: 'CSV' },
      { onSuccess: (made) => { importExport.mutate({ id: made.id }); } },
    );
  };

  // HARD RULE 5: the only thing branched on is `code`. `createExport` and `getExportPreview` declare none at all.
  const refusedCode = importExport.isError ? codeOf('importExport', importExport.error) : undefined;
  const imported = data?.last_import ?? null;

  return (
    <div className="flex flex-col gap-[20px]">
      <PageHead
        title="В BAS"
        description={DESCRIPTION}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="min-h-tap">
                  <Download aria-hidden="true" />
                  Завантажити файл ▾
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {FILES.map((file) => (
                  <DropdownMenuItem key={file.label} onSelect={() => { download(file); }}>
                    {file.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button className="min-h-tap" onClick={runImport}>
              <Upload aria-hidden="true" />
              Імпорт у BAS (імітація)
            </Button>
          </>
        }
      />

      <MockBanner text={OC.mockBanner} />

      <div className="flex flex-wrap items-center gap-[16px]">
        <DateStepper
          label={fmtDate(date)}
          onPrev={() => { goDate(addDays(date, -1)); }}
          onNext={() => { goDate(addDays(date, 1)); }}
          onToday={date === today ? undefined : () => { goDate(today); }}
          canNext={date !== today}
        />
        <Segmented
          options={SCOPES}
          value={scope}
          onChange={(next) => { setScope(next); }}
          label="Обсяг"
          fit="content"
          className="w-auto"
        />
      </div>

      {data === undefined ? (
        <Panel>
          <SkeletonRows rows={6} />
        </Panel>
      ) : (
        <>
          <p className="text-[14px] leading-[1.45] text-ink">{data.count_line}</p>

          <Tabs value={sheet} onValueChange={(v) => { setSheet(v as SheetKey); }}>
            <TabsList variant="line">
              {TABS.map((key) => (
                <TabsTrigger key={key} value={key} className="min-h-tap">
                  {`${viewOf(data, key).title} · ${String(viewOf(data, key).total)}`}
                </TabsTrigger>
              ))}
            </TabsList>
            {TABS.map((key) => (
              <TabsContent key={key} value={key}>
                <Panel>
                  <SheetTable view={viewOf(data, key)} mode={mode} />
                </Panel>
              </TabsContent>
            ))}
          </Tabs>
        </>
      )}

      {refusedCode === undefined ? null : (
        <p className="text-[14px] leading-[1.45] text-hold">{SAYS_EXPORT[refusedCode]}</p>
      )}

      {imported === null ? null : (
        <Panel title={`Імпорт (імітація) · ${fmtTime(imported.at)}`}>
          <div className="flex flex-col gap-[10px] px-[20px] py-[16px] text-[14px] leading-[1.45] text-ink">
            {imported.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {imported.note === '' ? null : <p>{imported.note}</p>}
            {imported.corrections.length === 0 ? null : (
              <div className="flex flex-col gap-[6px] border-t border-line/70 pt-[12px]">
                <p className="flex items-center gap-[8px] text-[13px] font-semibold text-text-2">
                  Конфлікти
                  <ExampleChip />
                </p>
                {imported.corrections.map((line) => (
                  <p key={line} className="text-hold">{line}</p>
                ))}
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
