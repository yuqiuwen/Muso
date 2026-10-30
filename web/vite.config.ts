import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";
  const port = Number(env.VITE_PORT || 8081);

  return {
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      proxy: {
        // 开发环境走同源代理：前端只认 /v1 与 /static，避免 CORS 和硬编码后端地址
        "/v1": { target: backendTarget, changeOrigin: true },
        "/static": { target: backendTarget, changeOrigin: true },
      },
    },
    plugins: [tsConfigPaths(), tailwindcss(), tanstackStart(), react()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
  };
});
