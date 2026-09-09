#!/usr/bin/env node
/**
 * The scaffolder's entry point, and the first command of the day-4 gate.
 *
 * Imported as `.ts` and run through Node's own type stripping, so there is no
 * build step between editing `src/new.ts` and running the CLI — the inner loop
 * the whole workspace is built around.
 */
import { newMock } from '../src/new.ts';

const USAGE =
  'usage: agency new <slug> [--title T] [--locale de|uk] [--profiles a,b] [--root DIR]';

const [, , command, ...rest] = process.argv;

function flag(name, fallback) {
  const at = rest.indexOf(`--${name}`);
  return at === -1 ? fallback : rest[at + 1];
}

/** Exit with a message a human can act on. A stack trace here is noise: every
 *  throw newMock produces is a bad argument, not a defect. */
function fail(message) {
  console.error(message);
  process.exit(1);
}

if (command !== 'new') fail(USAGE);

const slug = rest[0];
if (!slug || slug.startsWith('--')) fail(`agency new: a slug is required\n${USAGE}`);

try {
  const { dir } = await newMock({
    slug,
    title: flag('title'),
    locale: flag('locale', 'de'),
    profiles: flag('profiles')?.split(','),
    root: flag('root'),
  });
  console.log(`created ${dir}`);
  console.log(`next:  pnpm install && pnpm --filter ${slug} dev`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
