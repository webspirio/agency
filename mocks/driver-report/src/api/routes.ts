// mocks/driver-report/src/api/routes.ts
/** The handler map, the exactness sink and the clock seam. Handler bodies live in ./handlers/*; this file only names
 *  them, so `contract:complete` reads every key here and `toRoutes` compares every inferred return type. */
import { type HandlersOf, type Route } from '@agency/mock';
import { toRoutes, type Api } from './contract';
import { driverHandlers } from './handlers/driver';
import { myDayHandlers } from './handlers/myday';
import { officeHandlers } from './handlers/office';
import { reportHandlers } from './handlers/reports';
import { truckDayHandlers } from './handlers/truckdays';
import { server, type Server } from './server';

export function makeHandlers(s: Server = server) {
  const { getBindPreview, confirmBinding, getToday, listNearbyPlaces, submitRecord, uploadPhoto, sendHeartbeat } = driverHandlers(s);
  const { getMyDay, getMyMonth } = myDayHandlers(s);
  const { getOfficeSummary, listFleet, listExceptions, updateException, getStopReview, reviewStop, createRequest,
    createCorrection } = officeHandlers(s);
  const { listTruckDays, getTruckDay, confirmTruckDay, printTruckDay } = truckDayHandlers(s);
  const { getKeyPoints, getExportPreview, createExport, importExport, listTrucks, getTruckFuel, listOriginals,
    receiveOriginal, listWorktime, listDrivers, createBindCode } = reportHandlers(s);
  return { getBindPreview, confirmBinding, getToday, listNearbyPlaces, submitRecord, uploadPhoto, sendHeartbeat, getMyDay,
    getMyMonth, getOfficeSummary, listFleet, listExceptions, updateException, getStopReview, reviewStop, createRequest,
    createCorrection, listTruckDays, getTruckDay, confirmTruckDay, printTruckDay, getKeyPoints, getExportPreview,
    createExport, importExport, listTrucks, getTruckFuel, listOriginals, receiveOriginal, listWorktime, listDrivers,
    createBindCode } satisfies HandlersOf<Api>;
}

/** THE CHECK SITE: a handler returning more than its operation declares is a compile error here. */
export const routes: Route[] = toRoutes(makeHandlers());
/** The adapter’s clock seam (D16): every handler sees the stage clock as `c.now`. */
export const serverNow = (): string => server.clock.nowIso();
