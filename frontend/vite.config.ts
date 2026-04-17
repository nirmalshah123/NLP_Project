import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiProxy = {
  "/api": {
    target: "http://localhost:8000",
    ws: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
});
