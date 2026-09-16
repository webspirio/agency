/* @scaffold-owned — THE seam, and the whole reason this framework exists.
   One client is constructed here and one in the product, and the `adapter`
   line below is the entire difference between them. Everything above
   this file — components, TanStack Query hooks, query keys, error handling — is
   byte-identical on both sides, which is what makes conversion a deletion
   rather than a rewrite. Editing this file breaks that, and breaks it quietly. */
import axios from 'axios';
import { mockAdapter, transport } from '@agency/mock';
import { ACTOR, CAPS } from '../profiles';
import { routes } from './routes';

/* THE SEAM IS INSIDE THIS FILE. `httpClient` is an opaque `Transport`: only
   `call()` unwraps it, so a raw `httpClient.get(...)` anywhere in this mock —
   a page, a hook, a component, a helper — is a compile error rather than
   something a check has to go looking for.

   Anything that needs the RAW AxiosInstance attaches here, above the wrap:
   an interceptor, a retry policy, an auth header. Nothing outside this file
   can reach the instance, and that is the point. */
const instance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  // express@5's `simple` query parser plus Nest's forbidNonWhitelisted 400 on
  // axios's default bracketed array form (`ids[]=1&ids[]=2`). The product needs
  // this line, so the mock carries it too — a difference here is a difference
  // that only shows up after conversion.
  paramsSerializer: { indexes: null },
  // The one line. Build with VITE_MOCK='' and the same client talks to Nest.
  adapter: import.meta.env.VITE_MOCK ? mockAdapter(routes, { caps: CAPS, actor: ACTOR }) : undefined,
});

export const httpClient = transport(instance);
