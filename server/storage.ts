import { db } from "./db";
import { users, videoGenerationJobs } from "../shared/schema";
import { eq, and, desc, or, lt, sql } from "drizzle-orm";
import type { VideoGenerationJob, InsertVideoGenerationJob } from "../shared/schema";

export interface IStorage {
  getUser(id: string): Promise<any>;
  getUserByEmail(email: string): Promise<any>;
  createUser(data: any): Promise<any>;
  updateUser(id: string, data: any): Promise<any>;
  createVideoGenerationJob(data: InsertVideoGenerationJob): Promise<VideoGenerationJob>;
  getVideoGenerationJob(jobId: string): Promise<VideoGenerationJob | undefined>;
  getVideoGenerationJobsByScene(projectId: string, sceneId: string): Promise<VideoGenerationJob[]>;
  getPendingVideoGenerationJobs(): Promise<VideoGenerationJob[]>;
  updateVideoGenerationJob(jobId: string, data: Partial<InsertVideoGenerationJob>): Promise<VideoGenerationJob | undefined>;
  deleteVideoGenerationJob(jobId: string): Promise<boolean>;
  deleteVideoGenerationJobsByProject(projectId: string, statuses?: string[]): Promise<number>;
  recoverStuckVideoGenerationJobs(staleMinutes: number): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || null;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || null;
  }

  async createUser(data: any) {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async updateUser(id: string, data: any) {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async createVideoGenerationJob(data: InsertVideoGenerationJob): Promise<VideoGenerationJob> {
    const [job] = await db.insert(videoGenerationJobs).values(data).returning();
    return job;
  }

  async getVideoGenerationJob(jobId: string): Promise<VideoGenerationJob | undefined> {
    const [job] = await db.select().from(videoGenerationJobs).where(eq(videoGenerationJobs.jobId, jobId));
    return job || undefined;
  }

  async getVideoGenerationJobsByScene(projectId: string, sceneId: string): Promise<VideoGenerationJob[]> {
    return db.select().from(videoGenerationJobs)
      .where(and(
        eq(videoGenerationJobs.projectId, projectId),
        eq(videoGenerationJobs.sceneId, sceneId)
      ))
      .orderBy(desc(videoGenerationJobs.createdAt));
  }

  async getPendingVideoGenerationJobs(): Promise<VideoGenerationJob[]> {
    return db.select().from(videoGenerationJobs)
      .where(eq(videoGenerationJobs.status, "pending"))
      .orderBy(videoGenerationJobs.createdAt);
  }

  async updateVideoGenerationJob(jobId: string, data: Partial<InsertVideoGenerationJob>): Promise<VideoGenerationJob | undefined> {
    const [job] = await db.update(videoGenerationJobs)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(videoGenerationJobs.jobId, jobId))
      .returning();
    return job || undefined;
  }

  async deleteVideoGenerationJob(jobId: string): Promise<boolean> {
    const result = await db.delete(videoGenerationJobs).where(eq(videoGenerationJobs.jobId, jobId)).returning();
    return result.length > 0;
  }

  async deleteVideoGenerationJobsByProject(projectId: string, statuses?: string[]): Promise<number> {
    if (statuses && statuses.length > 0) {
      const result = await db.delete(videoGenerationJobs)
        .where(and(
          eq(videoGenerationJobs.projectId, projectId),
          or(...statuses.map(s => eq(videoGenerationJobs.status, s)))
        ))
        .returning();
      return result.length;
    }
    const result = await db.delete(videoGenerationJobs)
      .where(eq(videoGenerationJobs.projectId, projectId))
      .returning();
    return result.length;
  }

  async recoverStuckVideoGenerationJobs(staleMinutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
    const result = await db.update(videoGenerationJobs)
      .set({ status: "pending", updatedAt: new Date() })
      .where(and(
        or(
          eq(videoGenerationJobs.status, "running"),
          eq(videoGenerationJobs.status, "processing")
        ),
        lt(videoGenerationJobs.updatedAt, cutoff)
      ))
      .returning();
    return result.length;
  }
}

export const storage = new DatabaseStorage();
