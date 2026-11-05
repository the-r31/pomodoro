import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  if (command === "build" && (!env.VITE_SUPABASE_URL?.trim() || !env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim())) {
    throw new Error("Cloud configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the build environment or .env.production before building Pomodoro.");
  }
  return {
    plugins: [react()],
    clearScreen: false,
    server: { port: 1420, strictPort: true },
  };
});
