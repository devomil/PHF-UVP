import express from "express";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";

const app = express();
app.use(express.json({
  limit: "50mb",
  verify: (req: any, _res, buf) => {
    if (req.originalUrl === "/api/social/webhook" || req.url === "/api/social/webhook") {
      req.rawBody = buf;
    }
  },
}));
app.use(express.urlencoded({ extended: false }));

setupAuth(app);

(async () => {
  await registerRoutes(app);

  if (process.env.NODE_ENV === "production") {
    const { serveStatic } = await import("./vite");
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(app);
  }

  const port = 5000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
})();
