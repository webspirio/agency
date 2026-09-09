/* @scaffold-owned — THE seam, and the whole reason this framework exists.
   One client is constructed here and one in the product, and the `adapter`
   line below is the entire difference between them. Everything above
   this file — components, TanStack Query hooks, query keys, error handling — is
   byte-identical on both sides, which is what makes conversion a deletion
   rather than a rewrite. Editing this file breaks that, and breaks it quietly. */
import axios from 'axios';
import { mockAdapter } from '@agency/mock';
import { ACTOR, CAPS } from '../profiles';
import { routes } from './routes';

export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  // express@5's `simple` query parser plus Nest's forbidNonWhitelisted 400 on
  // axios's default bracketed array form (`ids[]=1&ids[]=2`). The product needs
  // this line, so the mock carries it too — a difference here is a difference
  // that only shows up after conversion.
  paramsSerializer: { indexes: null },
  // The one line. Build with VITE_MOCK='' and the same client talks to Nest.
  adapter: import.meta.env.VITE_MOCK ? mockAdapter(routes, { caps: CAPS, actor: ACTOR }) : undefined,
});
