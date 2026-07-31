import { db } from '../db';
import { universalVideoProjects } from '../../shared/schema';
import { desc, sql } from 'drizzle-orm';

(async () => {
  // Find projects with scenes that have all three Stage 4 fields
  const rows = await db.select({ id: universalVideoProjects.id, title: universalVideoProjects.title, scenes: universalVideoProjects.scenes })
    .from(universalVideoProjects)
    .where(sql`scenes::text like '%motionPrompt%' and scenes::text like '%imagePrompt%'`)
    .orderBy(desc(universalVideoProjects.id))
    .limit(5);

  let total = 0;
  outer:
  for (const r of rows) {
    const scenes = (r.scenes as any[]) || [];
    for (const sc of scenes) {
      const mss = sc.microScenes || [];
      for (const ms of mss) {
        if (ms.imagePrompt && ms.visualDirection && ms.motionPrompt) {
          const ipWords = ms.imagePrompt.trim().split(/\s+/).filter(Boolean).length;
          const vdWords = ms.visualDirection.trim().split(/\s+/).filter(Boolean).length;
          const mpWords = ms.motionPrompt.trim().split(/\s+/).filter(Boolean).length;
          console.log(`proj=${r.id} scene=${sc.id} ms=${ms.id || 'ms'}`);
          console.log(`  imagePrompt  (${ipWords}w): "${ms.imagePrompt.substring(0, 100)}"`);
          console.log(`  visualDir    (${vdWords}w): "${ms.visualDirection.substring(0, 100)}"`);
          console.log(`  motionPrompt (${mpWords}w): "${ms.motionPrompt.substring(0, 100)}"`);
          console.log();
          total++;
          if (total >= 5) break outer;
        }
      }
      // also check top-level scene
      if (total < 5 && sc.imagePrompt && sc.visualDirection && sc.motionPrompt) {
        const ipWords = sc.imagePrompt.trim().split(/\s+/).filter(Boolean).length;
        const vdWords = sc.visualDirection.trim().split(/\s+/).filter(Boolean).length;
        const mpWords = sc.motionPrompt.trim().split(/\s+/).filter(Boolean).length;
        console.log(`proj=${r.id} scene=${sc.id} (top-level)`);
        console.log(`  imagePrompt  (${ipWords}w): "${sc.imagePrompt.substring(0, 100)}"`);
        console.log(`  visualDir    (${vdWords}w): "${sc.visualDirection.substring(0, 100)}"`);
        console.log(`  motionPrompt (${mpWords}w): "${sc.motionPrompt.substring(0, 100)}"`);
        console.log();
        total++;
      }
    }
  }
  if (total === 0) console.log('no Stage 4 scenes found');
  process.exit(0);
})();
