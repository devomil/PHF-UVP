import { Router, Request, Response } from 'express';
import { PIAPI_TEST_DEFINITIONS, getTestById, getTestsByCategory } from './piapi-test-config';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db';
import { piapiTestResults } from '../../shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

const router = Router();

const PIAPI_BASE = 'https://api.piapi.ai';
const TASK_ENDPOINT = `${PIAPI_BASE}/api/v1/task`;
const CHAT_ENDPOINT = `${PIAPI_BASE}/v1/chat/completions`;

const TEST_IMAGE_DIR = path.join(process.cwd(), 'public', 'test-images');
if (!fs.existsSync(TEST_IMAGE_DIR)) {
  fs.mkdirSync(TEST_IMAGE_DIR, { recursive: true });
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

function getTestImageUrl(_req: Request): string | null {
  const files = fs.readdirSync(TEST_IMAGE_DIR).filter(f => f.startsWith('test-image'));
  if (files.length === 0) return null;

  const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS;
  if (replitDomain) {
    return `https://${replitDomain}/test-images/${files[0]}`;
  }

  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, '')}/test-images/${files[0]}`;
  }

  return `https://localhost:5000/test-images/${files[0]}`;
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
    audio: getTestsByCategory('audio'),
    llm: getTestsByCategory('llm'),
  };
  const imageUrl = getTestImageUrl(req);
  res.json({ definitions: grouped, totalCount: PIAPI_TEST_DEFINITIONS.length, testImageUrl: imageUrl });
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
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/piapi-tests/run/:testId', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const apiKey = getPiAPIKey();
  if (!apiKey) {
    return res.status(400).json({ error: 'PIAPI_API_KEY not configured' });
  }

  const testId = req.params.testId as string;
  const test = getTestById(testId);
  if (!test) {
    return res.status(404).json({ error: `Test "${testId}" not found` });
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
  const apiKey = getPiAPIKey();
  if (!apiKey) {
    return res.status(400).json({ error: 'PIAPI_API_KEY not configured' });
  }

  const category = req.params.category as string;
  const tests = getTestsByCategory(category);
  if (tests.length === 0) {
    return res.status(404).json({ error: `No tests found for category "${category}"` });
  }

  const results: TestResult[] = [];
  for (const test of tests) {
    try {
      const result = await runSingleTest(test, apiKey, req);
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
  const apiKey = getPiAPIKey();
  if (!apiKey) {
    return res.status(400).json({ error: 'PIAPI_API_KEY not configured' });
  }

  const submitTestId = req.params.testId as string;
  const test = getTestById(submitTestId);
  if (!test) {
    return res.status(404).json({ error: `Test "${submitTestId}" not found` });
  }

  try {
    const startTime = Date.now();

    if (test.endpoint === 'chat-completions') {
      const result = await runChatCompletionTest(test, apiKey);
      return res.json(result);
    }

    const inputData = { ...test.input };
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
      inputData[field] = imageUrl;
    }

    const requestBody: Record<string, any> = {
      model: test.model,
      task_type: test.taskType,
      input: inputData,
    };
    if (test.config) {
      requestBody.config = test.config;
    }

    console.log(`[PiAPI-Test] Submitting ${test.id}: ${JSON.stringify(requestBody)}`);

    const createRes = await fetch(TASK_ENDPOINT, {
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

  try {
    const pollRes = await fetch(`${PIAPI_BASE}/api/v1/task/${pollTaskId}`, {
      headers: { 'X-API-Key': apiKey },
    });

    if (!pollRes.ok) {
      return res.json({ status: 'error', error: `HTTP ${pollRes.status}` });
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

  try {
    const taskRes = await fetch(`${PIAPI_BASE}/api/v1/task/${taskId}`, {
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

async function runSingleTest(test: any, apiKey: string, req: Request): Promise<TestResult> {
  const startTime = Date.now();

  if (test.endpoint === 'chat-completions') {
    return runChatCompletionTest(test, apiKey);
  }

  try {
    const inputData = { ...test.input };
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

    const maxPollTime = 180000;
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

export default router;
