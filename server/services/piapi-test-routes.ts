import { Router, Request, Response } from 'express';
import { PIAPI_TEST_DEFINITIONS, getTestById, getTestsByCategory } from './piapi-test-config';
import { runwayVideoService } from './runway-video-service';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db';
import { piapiTestResults } from '../../shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { clearProviderCache } from '../config/ai-video-providers';

const router = Router();

const PIAPI_BASE = 'https://api.piapi.ai';
const TASK_ENDPOINT = `${PIAPI_BASE}/api/v1/task`;
const CHAT_ENDPOINT = `${PIAPI_BASE}/v1/chat/completions`;

const TEST_IMAGE_DIR = path.join(process.cwd(), 'public', 'test-images');
const TEST_VIDEO_DIR = path.join(process.cwd(), 'public', 'test-videos');
if (!fs.existsSync(TEST_IMAGE_DIR)) {
  fs.mkdirSync(TEST_IMAGE_DIR, { recursive: true });
}
if (!fs.existsSync(TEST_VIDEO_DIR)) {
  fs.mkdirSync(TEST_VIDEO_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEST_IMAGE_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `test-image${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
  },
});

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEST_VIDEO_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.mp4';
      cb(null, `test-video${ext}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only MP4, WebM, MOV, and AVI videos are allowed'));
    }
  },
});

function buildPublicUrl(subPath: string): string {
  const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;
  if (replitDomain) {
    return `https://${replitDomain}/${subPath}`;
  }
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, '')}/${subPath}`;
  }
  return `https://localhost:5000/${subPath}`;
}

function getTestImageUrl(_req: Request): string | null {
  const files = fs.readdirSync(TEST_IMAGE_DIR).filter(f => f.startsWith('test-image'));
  if (files.length === 0) return null;
  return buildPublicUrl(`test-images/${files[0]}`);
}

function getTestVideoUrl(_req: Request): string | null {
  const files = fs.readdirSync(TEST_VIDEO_DIR).filter(f => f.startsWith('test-video'));
  if (files.length === 0) return null;
  return buildPublicUrl(`test-videos/${files[0]}`);
}

interface TestResult {
  id: string;
  name: string;
  category: string;
  status: 'pass' | 'fail' | 'timeout' | 'skipped';
  responseTime: number;
  taskId?: string;
  taskStatus?: string;
  outputUrl?: string;
  outputText?: string;
  error?: string;
  rawResponse?: any;
}

function getPiAPIKey(): string | null {
  return process.env.PIAPI_API_KEY || null;
}

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  return true;
}

router.get('/api/piapi-tests/definitions', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const grouped = {
    video: getTestsByCategory('video'),
    image: getTestsByCategory('image'),
    i2v: getTestsByCategory('i2v'),
    i2i: getTestsByCategory('i2i'),
    v2v: getTestsByCategory('v2v'),
    toolkit: getTestsByCategory('toolkit'),
    'character-performance': getTestsByCategory('character-performance'),
    audio: getTestsByCategory('audio'),
    llm: getTestsByCategory('llm'),
    'llm-service': getTestsByCategory('llm-service'),
  };
  const imageUrl = getTestImageUrl(req);
  const videoUrl = getTestVideoUrl(req);
  res.json({ definitions: grouped, totalCount: PIAPI_TEST_DEFINITIONS.length, testImageUrl: imageUrl, testVideoUrl: videoUrl });
});

router.post('/api/piapi-tests/upload-test-image', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    const imageUrl = getTestImageUrl(req);
    res.json({ success: true, imageUrl, filename: req.file.filename });
  });
});

router.get('/api/piapi-tests/test-image', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const imageUrl = getTestImageUrl(req);
  res.json({ imageUrl });
});

router.delete('/api/piapi-tests/test-image', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const files = fs.readdirSync(TEST_IMAGE_DIR).filter(f => f.startsWith('test-image'));
  for (const f of files) {
    fs.unlinkSync(path.join(TEST_IMAGE_DIR, f));
  }
  res.json({ success: true });
});

router.post('/api/piapi-tests/upload-test-video', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  videoUpload.single('video')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }
    const videoUrl = getTestVideoUrl(req);
    res.json({ success: true, videoUrl, filename: req.file.filename });
  });
});

router.get('/api/piapi-tests/test-video', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const videoUrl = getTestVideoUrl(req);
  res.json({ videoUrl });
});

router.delete('/api/piapi-tests/test-video', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const files = fs.readdirSync(TEST_VIDEO_DIR).filter(f => f.startsWith('test-video'));
  for (const f of files) {
    fs.unlinkSync(path.join(TEST_VIDEO_DIR, f));
  }
  res.json({ success: true });
});

router.get('/api/piapi-tests/results', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any)?.id;
  if (!userId) return res.status(401).json({ error: 'User not found' });
  try {
    const latestResults = await db.execute(sql`
      SELECT DISTINCT ON (test_id) *
      FROM piapi_test_results
      WHERE tested_by = ${userId}
      ORDER BY test_id, tested_at DESC
    `);
    res.json({ results: latestResults.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/piapi-tests/results', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const { testId, testName, category, status, responseTime, taskId, outputUrl, outputText, error } = req.body;
  if (!testId || !status) {
    return res.status(400).json({ error: 'testId and status are required' });
  }
  try {
    const userId = (req.user as any)?.id || null;
    const [saved] = await db.insert(piapiTestResults).values({
      testId,
      testName: testName || testId,
      category: category || 'unknown',
      status,
      responseTime: responseTime || null,
      taskId: taskId || null,
      outputUrl: outputUrl || null,
      outputText: outputText || null,
      error: error || null,
      testedBy: userId,
    }).returning();
    clearProviderCache();
    res.json({ success: true, result: saved, testedAt: saved.testedAt });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/api/piapi-tests/results', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = (req.user as any)?.id;
  if (!userId) return res.status(401).json({ error: 'User not found' });
  try {
    await db.delete(piapiTestResults).where(eq(piapiTestResults.testedBy, userId));
    clearProviderCache();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/piapi-tests/run/:testId', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  const testId = req.params.testId as string;
  const test = getTestById(testId);
  if (!test) {
    return res.status(404).json({ error: `Test "${testId}" not found` });
  }

  if (test.endpoint === 'llm-service') {
    try {
      const result = await runLlmServiceTest(test);
      return res.json(result);
    } catch (error: any) {
      return res.json({ id: test.id, name: test.name, category: test.category, status: 'fail', responseTime: 0, error: error.message } as TestResult);
    }
  }

  const apiKey = getPiAPIKey();
  if (!apiKey) {
    return res.status(400).json({ error: 'PIAPI_API_KEY not configured' });
  }

  try {
    const result = await runSingleTest(test, apiKey, req);
    res.json(result);
  } catch (error: any) {
    res.json({
      id: test.id,
      name: test.name,
      category: test.category,
      status: 'fail',
      responseTime: 0,
      error: error.message,
    } as TestResult);
  }
});

router.post('/api/piapi-tests/run-category/:category', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  const category = req.params.category as string;
  const tests = getTestsByCategory(category);
  if (tests.length === 0) {
    return res.status(404).json({ error: `No tests found for category "${category}"` });
  }

  const isLlmServiceCategory = category === 'llm-service';
  const apiKey = isLlmServiceCategory ? null : getPiAPIKey();
  if (!isLlmServiceCategory && !apiKey) {
    return res.status(400).json({ error: 'PIAPI_API_KEY not configured' });
  }

  const results: TestResult[] = [];
  for (const test of tests) {
    try {
      const result = test.endpoint === 'llm-service'
        ? await runLlmServiceTest(test)
        : await runSingleTest(test, apiKey!, req);
      results.push(result);
    } catch (error: any) {
      results.push({
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'fail',
        responseTime: 0,
        error: error.message,
      });
    }
  }

  res.json({ category, results, passed: results.filter(r => r.status === 'pass').length, total: results.length });
});

router.post('/api/piapi-tests/submit/:testId', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  const submitTestId = req.params.testId as string;
  const test = getTestById(submitTestId);
  if (!test) {
    return res.status(404).json({ error: `Test "${submitTestId}" not found` });
  }
  if (test.disabled) {
    return res.status(400).json({ error: test.disabledReason || 'This test is currently disabled' });
  }

  if (test.endpoint === 'llm-service') {
    try {
      const result = await runLlmServiceTest(test);
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  const apiKey = getPiAPIKey();
  if (!apiKey) {
    return res.status(400).json({ error: 'PIAPI_API_KEY not configured' });
  }

  try {
    const startTime = Date.now();

    if (test.endpoint === 'chat-completions') {
      const result = await runChatCompletionTest(test, apiKey);
      return res.json(result);
    }

    if (test.taskType === 'runway-direct' || test.taskType === 'runway-direct-v2v' || test.taskType === 'runway-direct-cp') {
      if (!runwayVideoService.isAvailable()) {
        return res.json({
          id: test.id,
          name: test.name,
          category: test.category,
          status: 'fail',
          responseTime: 0,
          error: 'RUNWAY_API_KEY not configured',
        } as TestResult);
      }

      let result: any;

      if (test.taskType === 'runway-direct-v2v') {
        const videoUrl = getTestVideoUrl(req);
        if (!videoUrl) {
          return res.json({
            id: test.id, name: test.name, category: test.category,
            status: 'fail', responseTime: 0,
            error: 'No test video uploaded. Please upload a test video first.',
          } as TestResult);
        }
        result = await runwayVideoService.generateVideoToVideo({
          videoUrl,
          prompt: test.input.prompt || 'Transform this video with cinematic style',
          model: 'runway-gen4-aleph',
        });
      } else if (test.taskType === 'runway-direct-cp') {
        const imageUrl = getTestImageUrl(req);
        const videoUrl = getTestVideoUrl(req);
        if (!imageUrl) {
          return res.json({
            id: test.id, name: test.name, category: test.category,
            status: 'fail', responseTime: 0,
            error: 'No test image uploaded. Character Performance requires a character image.',
          } as TestResult);
        }
        if (!videoUrl) {
          return res.json({
            id: test.id, name: test.name, category: test.category,
            status: 'fail', responseTime: 0,
            error: 'No test video uploaded. Character Performance requires a reference performance video.',
          } as TestResult);
        }
        result = await runwayVideoService.generateCharacterPerformance({
          characterImageUrl: imageUrl,
          referenceVideoUrl: videoUrl,
          bodyControl: test.input.body_control !== false,
        });
      } else {
        result = await runwayVideoService.generateVideo({
          prompt: test.input.prompt,
          duration: test.input.duration || 5,
          aspectRatio: test.input.aspect_ratio === '9:16' ? '9:16' : test.input.aspect_ratio === '1:1' ? '1:1' : '16:9',
          model: test.id,
        });
      }

      return res.json({
        id: test.id,
        name: test.name,
        category: test.category,
        status: result.success ? 'pass' : 'fail',
        responseTime: result.generationTimeMs || (Date.now() - startTime),
        taskId: result.taskId,
        outputUrl: result.videoUrl,
        error: result.error,
      } as TestResult);
    }

    const inputData = { ...test.input };
    if (test.requiresVideo) {
      const videoUrl = getTestVideoUrl(req);
      if (!videoUrl) {
        return res.json({
          id: test.id,
          name: test.name,
          category: test.category,
          status: 'fail',
          responseTime: 0,
          error: 'No test video uploaded. Please upload a test video first.',
        } as TestResult);
      }
      const vField = test.videoInputField || 'video_url';
      inputData[vField] = videoUrl;
    }
    if (test.requiresImage) {
      const imageUrl = getTestImageUrl(req);
      if (!imageUrl) {
        return res.json({
          id: test.id,
          name: test.name,
          category: test.category,
          status: 'fail',
          responseTime: 0,
          error: 'No test image uploaded. Please upload a test image first.',
        } as TestResult);
      }
      const field = test.imageInputField || 'image_url';
      if (field === 'key_frames') {
        inputData.key_frames = {
          frame0: {
            type: 'image',
            url: imageUrl,
          },
        };
      } else if (field === 'image_urls') {
        inputData[field] = [imageUrl];
      } else {
        inputData[field] = imageUrl;
      }
    }

    let submitUrl = TASK_ENDPOINT;
    let requestBody: Record<string, any>;

    if (test.endpoint) {
      submitUrl = `${PIAPI_BASE}${test.endpoint}`;
      requestBody = { ...inputData };
      if (test.config) {
        requestBody.config = test.config;
      }
    } else {
      requestBody = {
        model: test.model,
        task_type: test.taskType,
        input: inputData,
      };
      if (test.config) {
        requestBody.config = test.config;
      }
    }

    console.log(`[PiAPI-Test] Submitting ${test.id} to ${submitUrl}: ${JSON.stringify(requestBody)}`);

    const createRes = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.log(`[PiAPI-Test] ${test.id} submit failed: HTTP ${createRes.status} - ${errorText.substring(0, 500)}`);
      return res.json({
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: `HTTP ${createRes.status}: ${errorText.substring(0, 200)}`,
      } as TestResult);
    }

    let createData: any;
    try {
      createData = await createRes.json();
    } catch {
      return res.json({
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: 'Invalid JSON response',
      } as TestResult);
    }

    console.log(`[PiAPI-Test] ${test.id} response: status=${createData.data?.status}, task_id=${createData.data?.task_id}, message=${createData.message || 'none'}`);

    if (!createData.data?.task_id) {
      return res.json({
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: createData.message || 'No task_id returned',
        rawResponse: createData,
      } as TestResult);
    }

    res.json({
      id: test.id,
      name: test.name,
      category: test.category,
      status: 'submitted',
      responseTime: Date.now() - startTime,
      taskId: createData.data.task_id,
      taskStatus: createData.data.status || 'pending',
    });
  } catch (error: any) {
    res.json({
      id: test.id,
      name: test.name,
      category: test.category,
      status: 'fail',
      responseTime: 0,
      error: error.message,
    } as TestResult);
  }
});

router.get('/api/piapi-tests/poll/:taskId', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const apiKey = getPiAPIKey();
  if (!apiKey) {
    return res.status(400).json({ error: 'PIAPI_API_KEY not configured' });
  }

  const pollTaskId = req.params.taskId as string;
  const testId = req.query.testId as string | undefined;

  const FALLBACK_POLL_ENDPOINTS: Record<string, string> = {
    'luma': '/api/luma/v1/video',
  };

  let pollUrl = `${PIAPI_BASE}/api/v1/task/${pollTaskId}`;
  if (testId) {
    const test = PIAPI_TEST_DEFINITIONS.find(t => t.id === testId);
    if (test?.pollEndpoint) {
      pollUrl = `${PIAPI_BASE}${test.pollEndpoint}/${pollTaskId}`;
    }
  }

  try {
    let pollRes = await fetch(pollUrl, {
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
    });

    if (!pollRes.ok && testId) {
      const test = PIAPI_TEST_DEFINITIONS.find(t => t.id === testId);
      const fallbackPath = test?.model ? FALLBACK_POLL_ENDPOINTS[test.model] : null;
      if (fallbackPath && !pollUrl.includes(fallbackPath)) {
        const fallbackUrl = `${PIAPI_BASE}${fallbackPath}/${pollTaskId}`;
        console.log(`[PiAPI-Test] Poll ${pollTaskId} primary failed (${pollRes.status}), trying fallback: ${fallbackUrl}`);
        pollRes = await fetch(fallbackUrl, {
          headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
        });
      }
    }

    if (!pollRes.ok) {
      const errBody = await pollRes.text().catch(() => '');
      console.log(`[PiAPI-Test] Poll ${pollTaskId} failed: HTTP ${pollRes.status} (url: ${pollUrl}) body: ${errBody.substring(0, 300)}`);
      return res.json({ status: 'error', error: `HTTP ${pollRes.status}: ${errBody.substring(0, 200)}` });
    }

    const pollData = await pollRes.json() as any;
    const status = pollData.data?.status;
    const output = pollData.data?.output;

    console.log(`[PiAPI-Test] Poll ${pollTaskId}: status=${status}, model=${pollData.data?.model || 'unknown'}`);

    const outputUrl = extractOutputUrl(output);

    res.json({
      taskId: pollTaskId,
      status: status,
      outputUrl,
      output: output ? JSON.stringify(output).substring(0, 1000) : null,
      error: pollData.data?.error ? JSON.stringify(pollData.data.error).substring(0, 300) : null,
    });
  } catch (error: any) {
    res.json({ status: 'error', error: error.message });
  }
});

router.get('/api/piapi-tests/task-output/:taskId', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const apiKey = getPiAPIKey();
  if (!apiKey) {
    return res.status(400).json({ error: 'PIAPI_API_KEY not configured' });
  }

  const taskId = req.params.taskId as string;
  const testId = req.query.testId as string | undefined;

  let fetchUrl = `${PIAPI_BASE}/api/v1/task/${taskId}`;
  if (testId) {
    const test = PIAPI_TEST_DEFINITIONS.find(t => t.id === testId);
    if (test?.pollEndpoint) {
      fetchUrl = `${PIAPI_BASE}${test.pollEndpoint}/${taskId}`;
    }
  }

  try {
    const taskRes = await fetch(fetchUrl, {
      headers: { 'X-API-Key': apiKey },
    });

    if (!taskRes.ok) {
      return res.status(taskRes.status).json({ error: `PiAPI returned ${taskRes.status}` });
    }

    const taskData = await taskRes.json() as any;
    const output = taskData.data?.output;
    const outputUrl = extractOutputUrl(output);

    if (outputUrl) {
      const userId = (req.user as any)?.id;
      if (userId) {
        await db.execute(sql`
          UPDATE piapi_test_results
          SET output_url = ${outputUrl}
          WHERE task_id = ${taskId} AND tested_by = ${userId} AND (output_url IS NULL OR output_url = '')
        `);
      }
      return res.redirect(outputUrl);
    }

    res.json({
      taskId,
      status: taskData.data?.status,
      output: output || null,
      message: 'No direct media URL found in task output',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function extractOutputUrl(output: any): string {
  if (!output) return '';

  if (output.video_url) return output.video_url;
  if (output.image_url) return output.image_url;
  if (output.audio_url) return output.audio_url;
  if (output.url) return output.url;
  if (output.video?.url) return output.video.url;
  if (output.video_raw?.url) return output.video_raw.url;

  if (Array.isArray(output.works) && output.works.length > 0) {
    const work = output.works[0];
    if (work?.resource?.resource) return work.resource.resource;
    if (work?.url) return work.url;
    if (work?.video_url) return work.video_url;
    if (work?.image_url) return work.image_url;
  }

  if (Array.isArray(output.videos) && output.videos.length > 0) {
    const v = output.videos[0];
    if (typeof v === 'string') return v;
    if (v?.url) return v.url;
    if (v?.video_url) return v.video_url;
  }

  if (Array.isArray(output.images) && output.images.length > 0) {
    const img = output.images[0];
    if (typeof img === 'string') return img;
    if (img?.url) return img.url;
    if (img?.image_url) return img.image_url;
  }

  if (output.result_url) return output.result_url;
  if (output.download_url) return output.download_url;
  if (output.media_url) return output.media_url;
  if (output.file_url) return output.file_url;

  const outputStr = JSON.stringify(output);
  const urlMatch = outputStr.match(/https?:\/\/[^\s"',}\]]+\.(mp4|webm|mov|jpg|jpeg|png|webp|gif|mp3|wav|ogg)/i);
  if (urlMatch) return urlMatch[0];

  return '';
}

async function runChatCompletionTest(test: any, apiKey: string): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const body: any = {
      model: test.model,
      messages: test.input.messages,
      max_tokens: 100,
    };

    if (test.id === 'gpt-image-1' || test.id === 'gpt-image-1.5') {
      body.messages = [
        {
          role: 'user',
          content: [{ type: 'text', text: test.input.prompt }],
        },
      ];
    }

    const chatRes = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const responseTime = Date.now() - startTime;

    if (!chatRes.ok) {
      const errorText = await chatRes.text();
      return {
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'fail',
        responseTime,
        error: `HTTP ${chatRes.status}: ${errorText.substring(0, 300)}`,
      };
    }

    let chatData: any;
    try {
      chatData = await chatRes.json();
    } catch {
      return {
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'fail',
        responseTime,
        error: 'Invalid JSON response',
      };
    }

    const content = chatData.choices?.[0]?.message?.content || '';
    const imageUrl = chatData.choices?.[0]?.message?.image_url || '';

    return {
      id: test.id,
      name: test.name,
      category: test.category,
      status: 'pass',
      responseTime,
      outputText: typeof content === 'string' ? content.substring(0, 300) : JSON.stringify(content).substring(0, 300),
      outputUrl: imageUrl || undefined,
      rawResponse: {
        model: chatData.model,
        usage: chatData.usage,
      },
    };
  } catch (error: any) {
    return {
      id: test.id,
      name: test.name,
      category: test.category,
      status: 'fail',
      responseTime: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function runLlmServiceTest(test: any): Promise<TestResult> {
  const startTime = Date.now();
  try {
    const { llmClient } = await import('../services/piapi-llm-client');

    if (!llmClient.isAvailable()) {
      return {
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'fail',
        responseTime: 0,
        error: 'LLM client not configured (no PiAPI or Anthropic API key)',
      };
    }

    const result = await llmClient.createChatCompletion({
      systemPrompt: test.input.systemPrompt,
      messages: [{ role: 'user', content: test.input.userMessage }],
      maxTokens: 300,
    });

    const responseTime = Date.now() - startTime;

    return {
      id: test.id,
      name: test.name,
      category: test.category,
      status: 'pass',
      responseTime,
      outputText: result.text?.substring(0, 500) || 'No response text',
      rawResponse: {
        provider: result.provider,
        model: result.model,
        service: test.input.serviceId,
      },
    };
  } catch (error: any) {
    return {
      id: test.id,
      name: test.name,
      category: test.category,
      status: 'fail',
      responseTime: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function runSingleTest(test: any, apiKey: string, req: Request): Promise<TestResult> {
  const startTime = Date.now();

  if (test.endpoint === 'chat-completions') {
    return runChatCompletionTest(test, apiKey);
  }

  if (test.endpoint === 'llm-service') {
    return runLlmServiceTest(test);
  }

  if (test.taskType === 'runway-direct' || test.taskType === 'runway-direct-v2v' || test.taskType === 'runway-direct-cp') {
    if (!runwayVideoService.isAvailable()) {
      return {
        id: test.id, name: test.name, category: test.category,
        status: 'fail', responseTime: 0, error: 'RUNWAY_API_KEY not configured',
      };
    }
    let result: any;
    if (test.taskType === 'runway-direct-v2v') {
      const videoUrl = getTestVideoUrl(req);
      if (!videoUrl) return { id: test.id, name: test.name, category: test.category, status: 'fail', responseTime: 0, error: 'No test video uploaded' };
      result = await runwayVideoService.generateVideoToVideo({ videoUrl, prompt: test.input.prompt || '', model: 'runway-gen4-aleph' });
    } else if (test.taskType === 'runway-direct-cp') {
      const imageUrl = getTestImageUrl(req);
      const videoUrl = getTestVideoUrl(req);
      if (!imageUrl) return { id: test.id, name: test.name, category: test.category, status: 'fail', responseTime: 0, error: 'No test image uploaded' };
      if (!videoUrl) return { id: test.id, name: test.name, category: test.category, status: 'fail', responseTime: 0, error: 'No test video uploaded' };
      result = await runwayVideoService.generateCharacterPerformance({ characterImageUrl: imageUrl, referenceVideoUrl: videoUrl, bodyControl: test.input.body_control !== false });
    } else {
      result = await runwayVideoService.generateVideo({ prompt: test.input.prompt, duration: test.input.duration || 5, aspectRatio: test.input.aspect_ratio === '9:16' ? '9:16' : test.input.aspect_ratio === '1:1' ? '1:1' : '16:9', model: test.id });
    }
    return {
      id: test.id, name: test.name, category: test.category,
      status: result.success ? 'pass' : 'fail',
      responseTime: result.generationTimeMs || (Date.now() - startTime),
      taskId: result.taskId, outputUrl: result.videoUrl, error: result.error,
    };
  }

  try {
    const inputData = { ...test.input };
    if (test.requiresVideo) {
      const videoUrl = getTestVideoUrl(req);
      if (!videoUrl) return { id: test.id, name: test.name, category: test.category, status: 'fail', responseTime: 0, error: 'No test video uploaded' };
      const vField = test.videoInputField || 'video_url';
      inputData[vField] = videoUrl;
    }
    if (test.requiresImage) {
      const imageUrl = getTestImageUrl(req);
      if (!imageUrl) {
        return {
          id: test.id,
          name: test.name,
          category: test.category,
          status: 'fail',
          responseTime: 0,
          error: 'No test image uploaded',
        };
      }
      const field = test.imageInputField || 'image_url';
      inputData[field] = imageUrl;
    }

    const createRes = await fetch(TASK_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: test.model,
        task_type: test.taskType,
        input: inputData,
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      return {
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: `HTTP ${createRes.status}: ${errorText.substring(0, 200)}`,
      };
    }

    let createData: any;
    try {
      createData = await createRes.json();
    } catch {
      return {
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: 'Invalid JSON response from PiAPI',
      };
    }

    if (!createData.data?.task_id) {
      return {
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: createData.message || 'No task_id in response',
        rawResponse: createData,
      };
    }

    const taskId = createData.data.task_id;

    if (!test.pollForResult) {
      return {
        id: test.id,
        name: test.name,
        category: test.category,
        status: 'pass',
        responseTime: Date.now() - startTime,
        taskId,
        taskStatus: 'submitted',
      };
    }

    const maxPollTime = test.timeoutMs || 180000;
    while (Date.now() - startTime < maxPollTime) {
      await new Promise(r => setTimeout(r, 3000));

      try {
        const pollRes = await fetch(`${PIAPI_BASE}/api/v1/task/${taskId}`, {
          headers: { 'X-API-Key': apiKey },
        });

        if (!pollRes.ok) continue;

        const pollData = await pollRes.json() as any;
        const status = pollData.data?.status;

        if (status === 'completed' || status === 'success' || status === 'succeeded') {
          const output = pollData.data?.output;
          const outputUrl = extractOutputUrl(output);

          return {
            id: test.id,
            name: test.name,
            category: test.category,
            status: 'pass',
            responseTime: Date.now() - startTime,
            taskId,
            taskStatus: 'completed',
            outputUrl: outputUrl || undefined,
          };
        }

        if (status === 'failed' || status === 'error' || status === 'cancelled') {
          return {
            id: test.id,
            name: test.name,
            category: test.category,
            status: 'fail',
            responseTime: Date.now() - startTime,
            taskId,
            taskStatus: status,
            error: JSON.stringify(pollData.data?.error || 'Task failed').substring(0, 300),
          };
        }
      } catch {
        continue;
      }
    }

    return {
      id: test.id,
      name: test.name,
      category: test.category,
      status: 'timeout',
      responseTime: Date.now() - startTime,
      taskId,
      taskStatus: 'timeout',
      error: 'Exceeded 3 minute polling timeout',
    };
  } catch (error: any) {
    return {
      id: test.id,
      name: test.name,
      category: test.category,
      status: 'fail',
      responseTime: Date.now() - startTime,
      error: error.message,
    };
  }
}

router.post('/api/runway-tests/generate', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!runwayVideoService.isAvailable()) {
    return res.status(400).json({ error: 'RUNWAY_API_KEY not configured' });
  }

  const { prompt, duration, aspect_ratio } = req.body;
  const testId = req.query.testId as string || req.body.testId;

  try {
    const startTime = Date.now();
    const modelKey = testId || 'runway';

    const result = await runwayVideoService.generateVideo({
      prompt: prompt || 'A gentle breeze moves through tall grass in golden sunlight',
      duration: duration || 5,
      aspectRatio: aspect_ratio === '9:16' ? '9:16' : aspect_ratio === '1:1' ? '1:1' : '16:9',
      model: modelKey,
    });

    if (result.success && result.videoUrl) {
      return res.json({
        id: testId,
        name: testId,
        category: 'video',
        status: 'pass',
        responseTime: Date.now() - startTime,
        taskId: result.taskId,
        outputUrl: result.videoUrl,
      });
    }

    return res.json({
      id: testId,
      name: testId,
      category: 'video',
      status: 'fail',
      responseTime: Date.now() - startTime,
      taskId: result.taskId,
      error: result.error || 'Generation failed',
    });
  } catch (error: any) {
    return res.json({
      id: testId,
      name: testId,
      category: 'video',
      status: 'fail',
      responseTime: 0,
      error: error.message,
    });
  }
});

router.post('/api/runway-tests/submit/:testId', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  if (!runwayVideoService.isAvailable()) {
    return res.status(400).json({ error: 'RUNWAY_API_KEY not configured' });
  }

  const testId = req.params.testId as string;
  const test = getTestById(testId);
  if (!test) {
    return res.status(404).json({ error: `Test "${testId}" not found` });
  }

  try {
    const startTime = Date.now();
    const result = await runwayVideoService.generateVideo({
      prompt: test.input.prompt,
      duration: test.input.duration || 5,
      aspectRatio: test.input.aspect_ratio === '9:16' ? '9:16' : test.input.aspect_ratio === '1:1' ? '1:1' : '16:9',
      model: testId,
    });

    if (result.success && result.videoUrl) {
      return res.json({
        id: testId,
        name: test.name,
        category: test.category,
        status: 'pass',
        responseTime: Date.now() - startTime,
        taskId: result.taskId,
        outputUrl: result.videoUrl,
      });
    }

    return res.json({
      id: testId,
      name: test.name,
      category: test.category,
      status: 'fail',
      responseTime: Date.now() - startTime,
      taskId: result.taskId,
      error: result.error || 'Generation failed',
    });
  } catch (error: any) {
    return res.json({
      id: testId,
      name: test.name,
      category: test.category,
      status: 'fail',
      responseTime: 0,
      error: error.message,
    });
  }
});

export default router;
