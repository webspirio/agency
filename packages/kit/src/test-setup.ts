import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Unmounts anything a test rendered, between tests.
 *
 * Testing Library registers this itself — but only when a global `afterEach`
 * exists, which means only under `globals: true`. This workspace's vitest
 * projects do not set it, so without this file the second `render()` in a file
 * stacks a second copy of the component into the same document and every
 * `getByRole` after it throws "Found multiple elements". That failure names the
 * query, not the cause, which is why it is worth a file with a name.
 *
 * Imported explicitly by each test rather than declared in a setupFile: the
 * root `vitest.setup.ts` is shared with the other packages and is not this
 * package's to edit. `cleanup` is idempotent, so if the root setup ever gains
 * it, this becomes a no-op rather than a conflict.
 */
afterEach(cleanup);
