/* @scaffold-owned — the persist config.

   Lane A persists NO domain rows. The seed regenerates on every load, so
   "reset demo data" is a reload, a redeploy cannot destroy anything, and there
   is no migration, no quota ceiling and no dangling user→seed id. `partialize`
   is what keeps it that way: it is an allow-list, so a domain slice added to
   this store later is silently NOT written, which is the failure direction you
   want. Do not add a seed/user origin partition to make rows survive a reload:
   it preserves exactly the rehearsal rows the pre-call reset exists to delete,
   and it turns a loud failure into a silent one (SPEC §7).

   Theme is deliberately not in this store: @agency/kit already owns the `.dark`
   class on <html>. Two owners of one class is a flicker nobody can reproduce. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { useAppTheme } from '@agency/kit/lib/theme';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { router } from './app/router';
import './index.css';

type UiState = {
  sidebar: boolean;
  setSidebar: (open: boolean) => void;
};

export const useUi = create<UiState>()(
  persist(
    (set) => ({ sidebar: true, setSidebar: (sidebar) => set({ sidebar }) }),
    { name: '{{slug}}:ui:v1', partialize: (s) => ({ sidebar: s.sidebar }) },
  ),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A demo is a timed performance. A retry backoff turns a deliberate 409
      // into four seconds of dead air, and a focus refetch flashes a skeleton
      // every time the presenter alt-tabs back from their notes.
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRoot() {
  useAppTheme();
  return <RouterProvider router={router} />;
}

const host = document.getElementById('root');
if (!host) throw new Error('main: #root is missing from index.html');

createRoot(host).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRoot />
    </QueryClientProvider>
  </StrictMode>,
);
