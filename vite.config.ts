import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // getUserMedia needs a secure context. localhost counts as secure, so
    // plain http is fine here — but on a phone over your LAN it is not.
    // Use `npx vite --host` plus a tunnel (or firebase hosting) to test on device.
  },
});
