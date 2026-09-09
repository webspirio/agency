import type { Route } from '@agency/mock';
import { overview } from '../domain/calc';

/**
 * One handler per screen action. Each handler body is the future Nest
 * controller body — same inputs, same envelope, same status codes — so a
 * converted endpoint is a move, not a rewrite.
 *
 * Add `caps: ['<capability>']` to a route and the adapter 404s it for any
 * profile that lacks the capability, so a typed URL cannot surface another
 * client's product.
 */
export const routes: Route[] = [
  { method: 'GET', path: '/overview', handler: () => overview(new Date().toISOString()) },
];
