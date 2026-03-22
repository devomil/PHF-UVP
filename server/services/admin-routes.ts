import { Router, Request, Response } from "express";
import { db } from "../db";
import { users, universalVideoProjects, videoGenerationJobs, productionLogs, videoProductions, mediaAssets, userMediaUploads, brandAssets, brandMediaLibrary, assetLibrary, piapiTestResults, brandSettings, characterLibrary, sceneRegenerationHistory } from "../../shared/schema";
import { eq, desc, sql, count, and, gte, lte, ne } from "drizzle-orm";
import { requireRole, isAuthenticated } from "../auth";

const router = Router();

router.use(isAuthenticated);
router.use(requireRole(["admin"]));

router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const [userStats] = await db
      .select({
        totalUsers: count(),
        activeUsers: sql<number>`COUNT(*) FILTER (WHERE ${users.isActive} = true)`,
      })
      .from(users);

    const [projectStats] = await db
      .select({
        totalProjects: count(),
        draftProjects: sql<number>`COUNT(*) FILTER (WHERE ${universalVideoProjects.status} = 'draft')`,
        readyProjects: sql<number>`COUNT(*) FILTER (WHERE ${universalVideoProjects.status} = 'ready')`,
        renderingProjects: sql<number>`COUNT(*) FILTER (WHERE ${universalVideoProjects.status} = 'rendering')`,
        completedProjects: sql<number>`COUNT(*) FILTER (WHERE ${universalVideoProjects.status} = 'completed')`,
        errorProjects: sql<number>`COUNT(*) FILTER (WHERE ${universalVideoProjects.status} = 'error')`,
      })
      .from(universalVideoProjects);

    const [jobStats] = await db
      .select({
        totalJobs: count(),
        completedJobs: sql<number>`COUNT(*) FILTER (WHERE ${videoGenerationJobs.status} = 'completed')`,
        failedJobs: sql<number>`COUNT(*) FILTER (WHERE ${videoGenerationJobs.status} = 'failed')`,
        pendingJobs: sql<number>`COUNT(*) FILTER (WHERE ${videoGenerationJobs.status} IN ('pending', 'processing'))`,
      })
      .from(videoGenerationJobs);

    const [costStats] = await db
      .select({
        totalCost: sql<string>`COALESCE(SUM(CAST(${productionLogs.apiCost} AS DECIMAL)), 0)`,
      })
      .from(productionLogs);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [recentUserCount] = await db
      .select({ count: count() })
      .from(users)
      .where(gte(users.createdAt, sevenDaysAgo));

    const [recentJobCount] = await db
      .select({ count: count() })
      .from(videoGenerationJobs)
      .where(gte(videoGenerationJobs.createdAt, sevenDaysAgo));

    const providerBreakdown = await db
      .select({
        provider: videoGenerationJobs.provider,
        count: count(),
        completed: sql<number>`COUNT(*) FILTER (WHERE ${videoGenerationJobs.status} = 'completed')`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${videoGenerationJobs.status} = 'failed')`,
      })
      .from(videoGenerationJobs)
      .groupBy(videoGenerationJobs.provider)
      .orderBy(desc(count()));

    res.json({
      success: true,
      dashboard: {
        users: {
          total: Number(userStats.totalUsers),
          active: Number(userStats.activeUsers),
          newThisWeek: Number(recentUserCount.count),
        },
        projects: {
          total: Number(projectStats.totalProjects),
          draft: Number(projectStats.draftProjects),
          ready: Number(projectStats.readyProjects),
          rendering: Number(projectStats.renderingProjects),
          completed: Number(projectStats.completedProjects),
          error: Number(projectStats.errorProjects),
        },
        generations: {
          total: Number(jobStats.totalJobs),
          completed: Number(jobStats.completedJobs),
          failed: Number(jobStats.failedJobs),
          pending: Number(jobStats.pendingJobs),
          thisWeek: Number(recentJobCount.count),
        },
        costs: {
          totalSpend: parseFloat(costStats.totalCost || "0"),
        },
        providerBreakdown,
      },
    });
  } catch (error: any) {
    console.error("[Admin] Dashboard error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/users", async (_req: Request, res: Response) => {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        isActive: users.isActive,
        phone: users.phone,
        company: users.company,
        jobTitle: users.jobTitle,
        address: users.address,
        city: users.city,
        state: users.state,
        zipCode: users.zipCode,
        country: users.country,
        billingEmail: users.billingEmail,
        billingName: users.billingName,
        billingAddress: users.billingAddress,
        billingCity: users.billingCity,
        billingState: users.billingState,
        billingZipCode: users.billingZipCode,
        billingCountry: users.billingCountry,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    const userProjectCounts = await db
      .select({
        ownerId: universalVideoProjects.ownerId,
        projectCount: count(),
        completedCount: sql<number>`COUNT(*) FILTER (WHERE ${universalVideoProjects.status} = 'completed')`,
      })
      .from(universalVideoProjects)
      .groupBy(universalVideoProjects.ownerId);

    const userJobCounts = await db
      .select({
        triggeredBy: videoGenerationJobs.triggeredBy,
        jobCount: count(),
      })
      .from(videoGenerationJobs)
      .where(sql`${videoGenerationJobs.triggeredBy} IS NOT NULL`)
      .groupBy(videoGenerationJobs.triggeredBy);

    const userCosts = await db
      .select({
        createdBy: videoProductions.createdBy,
        totalCost: sql<string>`COALESCE(SUM(CAST(${productionLogs.apiCost} AS DECIMAL)), 0)`,
        apiCallCount: count(),
      })
      .from(productionLogs)
      .innerJoin(videoProductions, eq(productionLogs.productionId, videoProductions.id))
      .where(sql`${productionLogs.apiCost} IS NOT NULL AND CAST(${productionLogs.apiCost} AS DECIMAL) > 0`)
      .groupBy(videoProductions.createdBy);

    const projectMap = new Map(userProjectCounts.map(r => [r.ownerId, r]));
    const jobMap = new Map(userJobCounts.map(r => [r.triggeredBy, r]));
    const costMap = new Map(userCosts.map(r => [r.createdBy, r]));

    const enrichedUsers = allUsers.map(u => ({
      ...u,
      projectCount: Number(projectMap.get(u.id)?.projectCount || 0),
      completedProjects: Number(projectMap.get(u.id)?.completedCount || 0),
      generationCount: Number(jobMap.get(u.id)?.jobCount || 0),
      totalApiCost: parseFloat(costMap.get(u.id)?.totalCost || "0"),
      apiCallCount: Number(costMap.get(u.id)?.apiCallCount || 0),
    }));

    res.json({ success: true, users: enrichedUsers });
  } catch (error: any) {
    console.error("[Admin] Users list error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch("/users/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { role, isActive } = req.body;
    const adminId = (req.user as any)?.id;

    if (userId === adminId) {
      return res.status(400).json({ success: false, error: "Cannot modify your own account" });
    }

    const updates: any = { updatedAt: new Date() };
    if (role !== undefined) {
      const validRoles = ["user", "employee", "admin"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, error: "Invalid role" });
      }
      updates.role = role;
    }
    if (isActive !== undefined) {
      updates.isActive = Boolean(isActive);
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      });

    if (!updated) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    console.log(`[Admin] User ${userId} updated by ${adminId}:`, updates);
    res.json({ success: true, user: updated });
  } catch (error: any) {
    console.error("[Admin] User update error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete("/users/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const adminId = (req.user as any)?.id;

    if (userId === adminId) {
      return res.status(400).json({ success: false, error: "Cannot delete your own account" });
    }

    const [existing] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId));

    if (!existing) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    await db.transaction(async (tx) => {
      const userProjects = await tx
        .select({ projectId: universalVideoProjects.projectId })
        .from(universalVideoProjects)
        .where(eq(universalVideoProjects.ownerId, userId));
      const projectIds = userProjects.map(p => p.projectId);

      if (projectIds.length > 0) {
        for (const pid of projectIds) {
          await tx.delete(sceneRegenerationHistory).where(eq(sceneRegenerationHistory.projectId, pid));
          await tx.delete(videoGenerationJobs).where(eq(videoGenerationJobs.projectId, pid));
        }
      }

      const userProds = await tx
        .select({ id: videoProductions.id })
        .from(videoProductions)
        .where(eq(videoProductions.createdBy, userId));

      if (userProds.length > 0) {
        for (const prod of userProds) {
          await tx.delete(productionLogs).where(eq(productionLogs.productionId, prod.id));
        }
      }
      await tx.delete(videoProductions).where(eq(videoProductions.createdBy, userId));

      await tx.delete(brandSettings).where(eq(brandSettings.userId, userId));
      await tx.delete(characterLibrary).where(eq(characterLibrary.ownerId, userId));
      await tx.delete(userMediaUploads).where(eq(userMediaUploads.uploadedBy, userId));
      await tx.delete(universalVideoProjects).where(eq(universalVideoProjects.ownerId, userId));

      await tx.update(mediaAssets).set({ uploadedBy: null }).where(eq(mediaAssets.uploadedBy, userId));
      await tx.update(brandAssets).set({ uploadedBy: null }).where(eq(brandAssets.uploadedBy, userId));
      await tx.update(brandMediaLibrary).set({ uploadedBy: null }).where(eq(brandMediaLibrary.uploadedBy, userId));
      await tx.update(assetLibrary).set({ createdBy: null }).where(eq(assetLibrary.createdBy, userId));
      await tx.update(piapiTestResults).set({ testedBy: null }).where(eq(piapiTestResults.testedBy, userId));
      await tx.update(videoGenerationJobs).set({ triggeredBy: null }).where(eq(videoGenerationJobs.triggeredBy, userId));

      await tx.delete(users).where(eq(users.id, userId));
    });

    console.log(`[Admin] User ${existing.email} (${userId}) deleted by ${adminId}`);
    res.json({ success: true, message: `User ${existing.email} has been deleted` });
  } catch (error: any) {
    console.error("[Admin] User delete error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/projects", async (_req: Request, res: Response) => {
  try {
    const projects = await db
      .select({
        projectId: universalVideoProjects.projectId,
        title: universalVideoProjects.title,
        status: universalVideoProjects.status,
        type: universalVideoProjects.type,
        totalDuration: universalVideoProjects.totalDuration,
        qualityTier: universalVideoProjects.qualityTier,
        outputUrl: universalVideoProjects.outputUrl,
        ownerId: universalVideoProjects.ownerId,
        createdAt: universalVideoProjects.createdAt,
        updatedAt: universalVideoProjects.updatedAt,
        ownerEmail: users.email,
        ownerFirstName: users.firstName,
        ownerLastName: users.lastName,
      })
      .from(universalVideoProjects)
      .leftJoin(users, eq(universalVideoProjects.ownerId, users.id))
      .orderBy(desc(universalVideoProjects.updatedAt));

    const projectJobCounts = await db
      .select({
        projectId: videoGenerationJobs.projectId,
        jobCount: count(),
        completedCount: sql<number>`COUNT(*) FILTER (WHERE ${videoGenerationJobs.status} = 'completed')`,
        failedCount: sql<number>`COUNT(*) FILTER (WHERE ${videoGenerationJobs.status} = 'failed')`,
      })
      .from(videoGenerationJobs)
      .groupBy(videoGenerationJobs.projectId);

    const jobMap = new Map(projectJobCounts.map(r => [r.projectId, r]));

    const enrichedProjects = projects.map(p => ({
      ...p,
      generationCount: Number(jobMap.get(p.projectId)?.jobCount || 0),
      completedGenerations: Number(jobMap.get(p.projectId)?.completedCount || 0),
      failedGenerations: Number(jobMap.get(p.projectId)?.failedCount || 0),
    }));

    res.json({ success: true, projects: enrichedProjects });
  } catch (error: any) {
    console.error("[Admin] Projects list error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/costs", async (_req: Request, res: Response) => {
  try {
    const byService = await db
      .select({
        service: productionLogs.apiService,
        totalCost: sql<string>`COALESCE(SUM(CAST(${productionLogs.apiCost} AS DECIMAL)), 0)`,
        callCount: count(),
      })
      .from(productionLogs)
      .where(sql`${productionLogs.apiCost} IS NOT NULL AND CAST(${productionLogs.apiCost} AS DECIMAL) > 0`)
      .groupBy(productionLogs.apiService)
      .orderBy(desc(sql`SUM(CAST(${productionLogs.apiCost} AS DECIMAL))`));

    const byProvider = await db
      .select({
        provider: videoGenerationJobs.provider,
        totalJobs: count(),
        completedJobs: sql<number>`COUNT(*) FILTER (WHERE ${videoGenerationJobs.status} = 'completed')`,
        failedJobs: sql<number>`COUNT(*) FILTER (WHERE ${videoGenerationJobs.status} = 'failed')`,
        avgDuration: sql<number>`AVG(${videoGenerationJobs.duration})`,
      })
      .from(videoGenerationJobs)
      .groupBy(videoGenerationJobs.provider)
      .orderBy(desc(count()));

    res.json({
      success: true,
      costs: {
        byService: byService.map(r => ({
          service: r.service,
          totalCost: parseFloat(r.totalCost || "0"),
          callCount: Number(r.callCount),
        })),
        byProvider: byProvider.map(r => ({
          provider: r.provider,
          totalJobs: Number(r.totalJobs),
          completedJobs: Number(r.completedJobs),
          failedJobs: Number(r.failedJobs),
          avgDuration: Number(r.avgDuration || 0),
        })),
      },
    });
  } catch (error: any) {
    console.error("[Admin] Costs error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/activity", async (_req: Request, res: Response) => {
  try {
    const recentUsers = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(10);

    const recentProjects = await db
      .select({
        projectId: universalVideoProjects.projectId,
        title: universalVideoProjects.title,
        status: universalVideoProjects.status,
        ownerId: universalVideoProjects.ownerId,
        ownerEmail: users.email,
        createdAt: universalVideoProjects.createdAt,
        updatedAt: universalVideoProjects.updatedAt,
      })
      .from(universalVideoProjects)
      .leftJoin(users, eq(universalVideoProjects.ownerId, users.id))
      .orderBy(desc(universalVideoProjects.updatedAt))
      .limit(15);

    const recentJobs = await db
      .select({
        id: videoGenerationJobs.id,
        jobId: videoGenerationJobs.jobId,
        projectId: videoGenerationJobs.projectId,
        provider: videoGenerationJobs.provider,
        status: videoGenerationJobs.status,
        sceneType: videoGenerationJobs.sceneType,
        createdAt: videoGenerationJobs.createdAt,
        completedAt: videoGenerationJobs.completedAt,
      })
      .from(videoGenerationJobs)
      .orderBy(desc(videoGenerationJobs.createdAt))
      .limit(20);

    type ActivityItem = {
      type: "user_signup" | "project_update" | "generation";
      timestamp: Date | null;
      data: any;
    };

    const activity: ActivityItem[] = [
      ...recentUsers.map(u => ({
        type: "user_signup" as const,
        timestamp: u.createdAt,
        data: { email: u.email, firstName: u.firstName },
      })),
      ...recentProjects.map(p => ({
        type: "project_update" as const,
        timestamp: p.updatedAt || p.createdAt,
        data: { title: p.title, status: p.status, ownerEmail: p.ownerEmail, projectId: p.projectId },
      })),
      ...recentJobs.map(j => ({
        type: "generation" as const,
        timestamp: j.completedAt || j.createdAt,
        data: { provider: j.provider, status: j.status, sceneType: j.sceneType, projectId: j.projectId },
      })),
    ];

    activity.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

    res.json({ success: true, activity: activity.slice(0, 30) });
  } catch (error: any) {
    console.error("[Admin] Activity error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
