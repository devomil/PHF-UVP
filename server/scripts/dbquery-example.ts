import { db } from '../db';
import { universalVideoProjects } from '../../shared/schema';
import { desc, sql } from 'drizzle-orm';

(async () => {
  // look for projects where any scene has imagePrompt set
  const rows = await db.select({ id: universalVideoProjects.id, scenes: universalVideoProjects.scenes })
    .from(universalVideoProjects)
    .where(sql`scenes::text like '%imagePrompt%'`)
    .orderBy(desc(universalVideoProjects.id))
    .limit(5);

  for (const r of rows) {
    const scenes = (r.scenes as any[]) || [];
    for (const sc of scenes) {
      // try micro-scenes first
      for (const ms of (sc.microScenes || [])) {
        if (ms.imagePrompt && ms.visualDirection) {
          console.log('=== project', r.id, 'scene', sc.id, 'micro-scene', ms.id, '===');
          console.log('imagePrompt:', ms.imagePrompt);
          console.log('---');
          console.log('visualDirection:', ms.visualDirection);
          console.log('---');
          console.log('motionPrompt:', ms.motionPrompt || '(none)');
          process.exit(0);
        }
      }
      if (sc.imagePrompt && sc.visualDirection) {
        console.log('=== project', r.id, 'scene', sc.id, '(top-level) ===');
        console.log('imagePrompt:', sc.imagePrompt);
        console.log('---');
        console.log('visualDirection:', sc.visualDirection);
        console.log('---');
        console.log('motionPrompt:', sc.motionPrompt || '(none)');
        process.exit(0);
      }
    }
  }
  console.log('no example found in DB');
  process.exit(0);
})();
