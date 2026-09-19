// mocks/driver-report/src/pages/office/ConsoleShell.tsx — a W0-18 placeholder: the console layout, which only renders its child route.
// W0-20 wrapped it in the BootGate (standalone default «Такт 10», §2.1); its Wave 2 owner replaces the file in full (I-16).
import { Outlet } from 'react-router';
import { BootGate } from '../../app/boot';

export function ConsoleShell() { return <BootGate defaultBeat={10}><Outlet /></BootGate>; }
