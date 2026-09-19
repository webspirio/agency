// mocks/driver-report/src/pages/driver/DriverShell.tsx — a W0-18 placeholder: the driver layout, which only renders its child route.
// W0-20 wrapped it in the BootGate (standalone default «Такт 2», §2.1); its Wave 2 owner replaces the file in full (I-16).
import { Outlet } from 'react-router';
import { BootGate } from '../../app/boot';

export function DriverShell() { return <BootGate defaultBeat={2}><Outlet /></BootGate>; }
