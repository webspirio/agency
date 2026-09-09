import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // One Worker per slug serves the mock at root, so base is '/' unless a build
  // deliberately targets a subpath. Combined with hash routing this is what
  // makes the hosting topology reversible: no rewrite rule, no 404.html.
  base: process.env.MOCK_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  // The mock/product switch, resolved at build time so the adapter and the
  // whole route table tree-shake out of a product build.
  define: { 'import.meta.env.VITE_MOCK': JSON.stringify(process.env.VITE_MOCK ?? '1') },
  build: { sourcemap: true },
});
