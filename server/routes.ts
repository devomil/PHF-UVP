import type { Express } from "express";
import { db } from "./db";
import { videoProductions, universalVideoProjects } from "../shared/schema";
import { desc } from "drizzle-orm";

export function registerRoutes(app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/projects", async (_req, res) => {
    try {
      const projects = await db
        .select()
        .from(universalVideoProjects)
        .orderBy(desc(universalVideoProjects.createdAt))
        .limit(50);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/productions", async (_req, res) => {
    try {
      const productions = await db
        .select()
        .from(videoProductions)
        .orderBy(desc(videoProductions.createdAt))
        .limit(50);
      res.json(productions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch productions" });
    }
  });
}
