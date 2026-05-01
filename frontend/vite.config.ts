import react from "@vitejs/plugin-react";
import http from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

import { shouldProxyToDjango } from "./viteProxy";

type ProxyMiddleware = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;
type MiddlewareStack = Array<{ route: string; handle: ProxyMiddleware }>;

function djangoDevProxyPlugin(): Plugin {
  return {
    name: "django-dev-proxy",
    configureServer(server) {
      const middleware: ProxyMiddleware = (req, res, next) => {
        const requestPath = req.url ?? "/";
        if (!shouldProxyToDjango(requestPath)) {
          next();
          return;
        }

        const proxyRequest = http.request(
          {
            hostname: "api",
            port: 8000,
            path: requestPath,
            method: req.method,
            headers: {
              ...req.headers,
              host: "api:8000",
            },
          },
          (proxyResponse) => {
            res.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
            proxyResponse.pipe(res, { end: true });
          },
        );

        proxyRequest.on("error", (error) => {
          res.statusCode = 502;
          res.end(`Django dev proxy error: ${error.message}`);
        });

        req.pipe(proxyRequest, { end: true });
      };

      const stack = (server.middlewares as unknown as { stack?: MiddlewareStack }).stack;
      if (Array.isArray(stack)) {
        stack.unshift({ route: "", handle: middleware });
        return;
      }

      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [djangoDevProxyPlugin(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
