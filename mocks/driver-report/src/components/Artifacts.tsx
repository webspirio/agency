/**
 * THE THREE THINGS A DRIVER PHOTOGRAPHS, drawn rather than shipped as images.
 *
 * Why drawn: a mock must not carry a real client's paperwork as a binary, the
 * repo ships no asset pipeline, and HARD RULE 6 forbids a new dependency. Drawn
 * artefacts also RE-RENDER per row, so the dispatcher's queue shows the right
 * ТТН number against the right event instead of one stock photograph repeated
 * eleven times — which is the detail that makes a demo look like a product.
 *
 * They stand in for the capture in two places: as the face of a camera tile, so
 * the driver is shown a photograph of the thing rather than a camera glyph (the
 * low-literacy HCI finding is that stylised icons are semantically opaque and
 * concrete imagery is not), and as the image beside the dispatcher's one input,
 * because a captured Blob cannot survive the profile switch a `?profile=` demo
 * performs.
 *
 * THE ТТН BELOW IS THE CURRENT FORM. Form №1-ТН, додаток 7 to Правила №363, in
 * the наказ №1727 від 12.12.2025 redaction effective 26.07.2026 — which added
 * «місце зберігання транспортного засобу». Its fields are the ones ст.48 ЗУ
 * «Про автомобільний транспорт» makes mandatory. A sample on an older layout is
 * something this client's own logistician would spot in a second.
 */

type TtnProps = {
  /** NULL before a dispatcher has read it off the photograph — which is every
   *  event's state at capture, because the driver is never asked. */
  number: string | null;
  date: string;
  plate: string;
  driverName: string;
  from: string;
  to: string;
  /** The consignee's signature and stamp. Present only on примірник 3 — the
   *  copy photographed at UNLOADING, and the one that proves delivery. */
  stamped?: boolean;
};

export function PaperTtn({ number, date, plate, driverName, from, to, stamped }: TtnProps) {
  return (
    <article
      aria-label={`Товарно-транспортна накладна ${number ?? 'без номера'}`}
      className="relative mx-auto w-full max-w-[420px] rotate-[-0.4deg] rounded-sm bg-[#fdfdf8] p-3 text-[#1b1b1b] shadow-lg ring-1 ring-black/10 sm:p-4"
    >
      <header className="border-b border-[#1b1b1b]/30 pb-2 text-center">
        <p className="text-[9px] leading-tight tracking-wide uppercase opacity-70">
          Додаток 7 до Правил перевезень вантажів автомобільним транспортом
        </p>
        <h3 className="mt-1 text-[13px] font-bold sm:text-sm">
          ТОВАРНО-ТРАНСПОРТНА НАКЛАДНА
        </h3>
        <p className="text-[11px] font-semibold">
          № <span className="font-mono tracking-wider">{number ?? '__________'}</span>
          <span className="ml-3 font-normal">від {date}</span>
        </p>
      </header>

      <dl className="mt-2 space-y-[3px] text-[10px] leading-snug sm:text-[11px]">
        <Row label="Автомобільний перевізник" value='ТОВ «КОРМО-ТРАНС-ЛОГІСТИК», 37380270' />
        <Row label="Вантажовідправник" value={from} />
        <Row label="Вантажоодержувач" value={to} />
        <Row label="Пункт навантаження" value={from} />
        <Row label="Пункт розвантаження" value={to} />
        <Row label="Автомобіль / причіп" value={`Scania · ${plate}`} />
        <Row label="Місце зберігання ТЗ" value="м. Запоріжжя, вул. В. Стуса, 14" />
        <Row label="Водій" value={driverName} />
      </dl>

      <table className="mt-2 w-full border-collapse text-[9px] sm:text-[10px]">
        <thead>
          <tr className="bg-[#1b1b1b]/5">
            <th className="border border-[#1b1b1b]/25 px-1 py-[3px] text-left font-semibold">
              Найменування вантажу
            </th>
            <th className="border border-[#1b1b1b]/25 px-1 py-[3px] font-semibold">Од.</th>
            <th className="border border-[#1b1b1b]/25 px-1 py-[3px] font-semibold">Кільк.</th>
            <th className="border border-[#1b1b1b]/25 px-1 py-[3px] font-semibold">Маса, т</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-[#1b1b1b]/25 px-1 py-[3px]">
              Комбікорм гранульований
            </td>
            <td className="border border-[#1b1b1b]/25 px-1 py-[3px] text-center">т</td>
            <td className="border border-[#1b1b1b]/25 px-1 py-[3px] text-center">1</td>
            <td className="border border-[#1b1b1b]/25 px-1 py-[3px] text-center">22,400</td>
          </tr>
        </tbody>
      </table>

      <footer className="mt-3 flex items-end justify-between gap-2">
        <p className="text-[9px] leading-tight opacity-70">
          Здав (відправник)
          <br />
          <span className="font-[cursive] text-[15px] opacity-90">Ковальчук</span>
        </p>
        <p className="text-[9px] leading-tight opacity-70">
          Прийняв (одержувач)
          <br />
          {stamped ? (
            <span className="font-[cursive] text-[15px] opacity-90">Тарасенко</span>
          ) : (
            <span className="inline-block h-[15px] w-20 border-b border-dotted border-[#1b1b1b]/40" />
          )}
        </p>
      </footer>

      {/* The wet stamp. Present only on примірник 3, and drawn rather than
          described because the whole point of the unloading photo is that a
          human can SEE it is there. */}
      {stamped ? (
        <div
          aria-hidden
          className="pointer-events-none absolute right-3 bottom-6 flex size-[74px] rotate-[-14deg] items-center justify-center rounded-full border-[2.5px] border-[#1c3f86]/70 text-center text-[7px] leading-[1.15] font-bold tracking-wide text-[#1c3f86]/70"
        >
          ТОВ
          <br />
          АГРО-СХІД
          <br />
          ЄДРПОУ
        </div>
      ) : null}
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt className="shrink-0 opacity-60">{label}:</dt>
      <dd className="min-w-0 flex-1 truncate border-b border-dotted border-[#1b1b1b]/25 font-medium">
        {value}
      </dd>
    </div>
  );
}

/**
 * A thermal fill receipt. Deliberately narrow, monospaced and slightly askew —
 * the shape of the thing actually crumpled into a door pocket. Litres and the
 * hryvnia total are rendered from the row rather than drawn in, because they are
 * the two values the office reads off it.
 */
export function FuelReceipt({
  station,
  litres,
  amount,
  date,
  plate,
}: {
  station: string;
  litres: string | null;
  amount: string | null;
  date: string;
  plate: string;
}) {
  return (
    <article
      aria-label={`Чек із заправки ${station}`}
      className="mx-auto w-full max-w-[230px] rotate-[0.8deg] rounded-sm bg-[#fbfbf6] px-3 py-3 font-mono text-[10px] leading-relaxed text-[#26262a] shadow-lg ring-1 ring-black/10"
    >
      <p className="text-center text-[11px] font-bold tracking-wide">{station.split(',')[0]}</p>
      <p className="text-center text-[9px] opacity-60">{station}</p>
      <Rule />
      <Line k="Дата" v={date} />
      <Line k="Колонка" v="4" />
      <Line k="Пальне" v="ДП Євро-5" />
      <Line k="Авто" v={plate} />
      <Rule />
      <Line k="Літрів" v={litres === null ? '—' : `${litres} л`} />
      <Line k="Ціна" v="52,00 грн/л" />
      <p className="mt-1 flex justify-between text-[12px] font-bold">
        <span>ДО СПЛАТИ</span>
        <span>{amount === null ? '—' : `${amount} грн`}</span>
      </p>
      <Rule />
      <p className="text-center text-[8px] opacity-60">Паливна картка ****4417</p>
      <p className="text-center text-[8px] opacity-60">ДЯКУЄМО ЗА ВІЗИТ</p>
    </article>
  );
}

const Rule = () => <p className="my-1 overflow-hidden text-[8px] opacity-40">{'-'.repeat(44)}</p>;

function Line({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex justify-between gap-2">
      <span className="opacity-60">{k}</span>
      <span>{v}</span>
    </span>
  );
}

/**
 * A Scania instrument cluster. The client's own «Про компанію» page says the
 * fleet is «на 97% складається з автомобілів марки Scania», which is the single
 * most favourable fact available about reading an odometer from a photograph: a
 * Euro 5/6 cluster is a backlit digital panel, not a grimy analogue drum.
 *
 * The total and the trip counter are both shown, and that is not decoration —
 * photographing the wrong row is a real and common error, and it is why the
 * office compares every reading against the last one.
 */
export function DashCluster({ km }: { km: number }) {
  const digits = String(km).padStart(7, '0');
  return (
    <article
      aria-label={`Щиток приладів, ${km} км`}
      className="mx-auto w-full max-w-[300px] rounded-xl bg-[#101215] p-4 shadow-lg ring-1 ring-white/10"
    >
      <p className="text-center text-[9px] tracking-[0.3em] text-white/35">SCANIA</p>
      <div className="mt-2 rounded-md bg-[#0b2a1c] px-3 py-2 ring-1 ring-[#6ee7b7]/25">
        <p className="text-[8px] tracking-widest text-[#6ee7b7]/60">TOTAL</p>
        <p className="flex items-baseline justify-end gap-1">
          <span className="font-mono text-[26px] leading-none font-semibold tracking-[0.08em] text-[#7bf5c4] tabular-nums">
            {digits}
          </span>
          <span className="text-[10px] text-[#6ee7b7]/70">km</span>
        </p>
      </div>
      <div className="mt-1.5 flex items-baseline justify-end gap-1 px-3">
        <span className="text-[8px] tracking-widest text-white/30">TRIP 1</span>
        <span className="ml-auto font-mono text-[13px] text-white/45 tabular-nums">248.6</span>
        <span className="text-[9px] text-white/30">km</span>
      </div>
    </article>
  );
}
