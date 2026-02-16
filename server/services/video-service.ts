import express from 'express';
import passport from 'passport';
import { getSession } from './auth';
import { storage } from './storage';

const VIDEO_SERVICE_PORT = 5001;

function log(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [video-service] ${message}`);
}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.set("trust proxy", 1);

app.use(getSession());
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'video-service', pid: process.pid, uptime: process.uptime() });
});

(async () => {
  try {
    const universalVideoRoutes = await import('./routes/universal-video-routes');
    app.use('/api/universal-video', universalVideoRoutes.default);
    log('Mounted universal-video routes');

    const { videoGenerationWorker } = await import('./services/video-generation-worker');
    videoGenerationWorker.startWorker(3000);
    log('Video generation worker initialized (every 3 seconds)');

    const { startVideoWorkerLoop } = await import('./video-worker-process');
    startVideoWorkerLoop();
    log('Video project worker loop initialized (polls every 5 seconds)');

    app.listen(VIDEO_SERVICE_PORT, '0.0.0.0', () => {
      log(`Video service running on port ${VIDEO_SERVICE_PORT} (PID: ${process.pid})`);
    });
  } catch (err) {
    console.error('[video-service] Failed to start:', err);
    process.exit(1);
  }
})();
