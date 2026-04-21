import type { Express } from "express";
import express from "express";
import fs from "fs";
import path from "path";
import type { Server as HttpServer } from "http";
import { fileURLToPath } from "url";
import { createServer as createViteServer, type ViteDevServer } from "vite";

const expressStatic = express.static;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function setupVite(app: Express, httpServer?: HttpServer) {
  const vite = await createViteServer({
    configFile: path.resolve(__dirname, "..", "vite.config.ts"),
    server: {
      middlewareMode: true,
      hmr: httpServer
        ? {
            server: httpServer,
            clientPort: 443,
            protocol: "wss",
            host: process.env.REPLIT_DEV_DOMAIN,
          }
        : false,
      allowedHosts: true,
    },
    appType: "spa",
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    if (url.startsWith("/api")) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(__dirname, "..", "client", "index.html");
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "..", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(`Build output not found at ${distPath}. Run "npm run build" first.`);
  }

  app.use(expressStatic(distPath));

  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
