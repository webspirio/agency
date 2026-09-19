// mocks/driver-report/src/components/office/saveFile.ts
/** The one way this product puts a file on a disk (§8.4 #11, C-10, C-11).
 *
 *  A `Blob`, an object URL, a temporary `<a download>` clicked and removed, then the URL revoked. Never `fetch`
 *  (there is no server to ask — the sheet was built in the browser, and `fetch` is banned under `src/components/**`
 *  anyway), never `window.open` (a popup blocker eats it mid-demo and nothing says why), and never a dialog: the
 *  browser's own download shelf is the confirmation, plus the «Файл … збережено» toast the caller raises.
 *
 *  `content` arrives finished — the CSV writer in `src/domain/export.ts` owns the BOM, the `;` separator and the
 *  CRLF line ends, because whether a file opens correctly in Excel is a property of the bytes, not of the click. */
export function saveFile(name: string, mime: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  try {
    a.click();
  } finally {
    a.remove();
    URL.revokeObjectURL(url);
  }
}
