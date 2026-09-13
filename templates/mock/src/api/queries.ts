/**
 * THE DATA LAYER, derived from the same registry every call site is typed against.
 *
 * A screen hand-wrote `queryKey: ['parties', page]` for an operation named
 * `listParties`, with `invalidateQueries({ queryKey: ['parties'] })` beside it — two
 * strings that had to agree with each other and with a name neither of them contained,
 * and that a rename of the operation would not have moved.
 *
 * `query` and `mutation` return OPTIONS OBJECTS, so a screen spreads them into its own
 * `useQuery`/`useMutation` and `@agency/mock` needs no React dependency.
 *
 * ITS OWN MODULE, and that is forced rather than tidy: `contract.ts` cannot build this
 * itself because it would have to import `./client`, which imports `./routes`, which
 * imports `./contract`. Measured as `toRoutes is not a function` at module init.
 */
import { makeQueries } from '@agency/mock';
import { httpClient } from './client';
import { contract } from './contract';

export const queries = makeQueries(contract, httpClient);
