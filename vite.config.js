import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    // Do not hard-code the HMR WebSocket port. This avoids connection failures
    // behind proxies/dev containers and lets Vite infer the active origin.
    hmr: true,
  },
});
