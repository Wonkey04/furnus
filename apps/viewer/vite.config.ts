import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = `http://127.0.0.1:${process.env.FURNUS_API_PORT ?? 4010}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": api,
      "/ws": { target: api, ws: true },
    },
  },
});
