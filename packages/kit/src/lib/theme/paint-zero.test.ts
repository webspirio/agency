import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../../test-setup';

/**
 * Paint 0 is a HANDSHAKE between two files that live in different packages: the
 * inline `<script>` `agency new` writes into `mocks/<slug>/index.html`, and the
 * store in this directory. The script exists only to read what the store wrote,
 * before React mounts, so the first frame is not light-then-dark in front of a
 * client. If the two disagree about the storage key the script silently reads
 * `null`, decides "light", and the flash is back — with nothing red anywhere.
 *
 * So the agreement is the test, and it is asserted against the REAL template
 * file rather than a copy of the string. This test file lives in the kit
 * because the workspace runs `packages/kit/src/**` under jsdom and
 * `packages/cli/src/**` under node, and running the script needs a document.
 */
// Resolved from the vitest root rather than `import.meta.url`: under the jsdom
// environment `import.meta.url` is not a file: URL and fileURLToPath throws.
const HBS = resolve(process.cwd(), 'templates/mock/index.html.hbs');

/** The template as `agency new --slug <slug>` renders it. `slug` is validated
 *  against `/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/`, so it needs no escaping. */
function renderIndexHtml(slug: string): Document {
  expect(existsSync(HBS)).toBe(true);
  const html = readFileSync(HBS, 'utf8')
    .replaceAll('{{slug}}', slug)
    .replaceAll('{{locale}}', 'de')
    .replaceAll('{{title}}', 'ACME Logistics');
  expect(html).not.toContain('{{');
  return new DOMParser().parseFromString(html, 'text/html');
}

/** The paint-0 script, extracted from the rendered document. */
function paintZeroScript(doc: Document): string {
  const inline = [...doc.querySelectorAll('script')].find((s) => !s.getAttribute('src'));
  const body = inline?.textContent ?? '';
  expect(body).toMatch(/localStorage/);
  return body;
}

/** A store module evaluated fresh, the way a page load evaluates it. */
async function freshStore() {
  vi.resetModules();
  return (await import('./theme-preference')).useThemePreference;
}

afterEach(() => {
  delete document.documentElement.dataset.themeKey;
  document.documentElement.classList.remove('dark');
  localStorage.clear();
});

describe('paint 0 — the inline script and the store must agree', () => {
  it('scopes the key to the mock, so two mocks on one origin cannot fight', async () => {
    // Harmless in production — one Worker per slug — and not harmless at all on
    // localhost:5173, which is where every mock is shown to the agency before
    // it is shown to the client, and where `web-starter:theme` was one key
    // shared by all of them.
    document.documentElement.dataset.themeKey = 'acme-crm:theme';
    const acme = await freshStore();
    acme.getState().setPreference('dark');

    document.documentElement.dataset.themeKey = 'wagner-logistics:theme';
    const wagner = await freshStore();

    expect(wagner.getState().preference).toBe('system');
    expect(localStorage.getItem('acme-crm:theme')).toBe('dark');
    expect(localStorage.getItem('wagner-logistics:theme')).toBeNull();
  });

  it('reads the key out of the document, which is what the scaffolder writes', () => {
    const doc = renderIndexHtml('acme-crm');
    expect(doc.documentElement.dataset.themeKey).toBe('acme-crm:theme');
  });

  it("the script paints dark from exactly what the store persisted", async () => {
    const doc = renderIndexHtml('acme-crm');
    document.documentElement.dataset.themeKey = doc.documentElement.dataset.themeKey ?? '';

    const store = await freshStore();
    store.getState().setPreference('dark');

    // A fresh page load: nothing on <html> yet, the script runs before React.
    document.documentElement.classList.remove('dark');
    new Function(paintZeroScript(doc))();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not paint another mock dark off this one - the key is not shared', async () => {
    const acme = renderIndexHtml('acme-crm');
    document.documentElement.dataset.themeKey = acme.documentElement.dataset.themeKey ?? '';
    (await freshStore()).getState().setPreference('dark');

    const wagner = renderIndexHtml('wagner-logistics');
    document.documentElement.dataset.themeKey = wagner.documentElement.dataset.themeKey ?? '';
    document.documentElement.classList.remove('dark');
    new Function(paintZeroScript(wagner))();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
