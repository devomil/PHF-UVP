import { db } from '../db';
import { universalVideoProjects } from '../../shared/schema';
import { desc, sql } from 'drizzle-orm';

(async () => {
  // Find a project with multiple scenes and narration set — suitable for image-first-i2v smoke test
  const rows = await db.select({
    id: universalVideoProjects.id,
    projectId: universalVideoProjects.projectId,
    title: universalVideoProjects.title,
    scenes: universalVideoProjects.scenes,
    videoGenerationMode: (universalVideoProjects as any).videoGenerationMode,
  })
    .from(universalVideoProjects)
    .where(sql`jsonb_array_length(scenes) >= 2`)
    .orderBy(desc(universalVideoProjects.id))
    .limit(5);

  for (const r of rows) {
    const scenes = (r.scenes as any[]) || [];
    const hasNarration = scenes.every(s => s.narration && s.narration.length > 10);
    if (hasNarration) {
      console.log('project id:', r.id, '| projectId:', r.projectId, '| title:', r.title);
      console.log('scene count:', scenes.length);
      console.log('current videoGenerationMode:', (r as any).videoGenerationMode || 'unset');
      for (const sc of scenes.slice(0, 3)) {
        console.log(`  scene ${sc.id}: narration="${(sc.narration||'').substring(0, 60)}" visualDir="${(sc.visualDirection||'').substring(0, 60)}"`);
      }
      break;
    }
  }
  process.exit(0);
})();
