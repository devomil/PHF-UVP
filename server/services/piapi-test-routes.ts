import { Router, Request, Response } from 'express';
import { PIAPI_TEST_DEFINITIONS, getTestById, getTestsByCategory } from './piapi-test-config';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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

    let outputUrl = '';
    if (output) {
      outputUrl = output.video_url || output.image_url || output.audio_url ||
        (Array.isArray(output.images) && output.images[0]?.url) ||
        (Array.isArray(output.videos) && output.videos[0]?.url) ||
        output.url || '';
    }

    res.json({
      taskId: pollTaskId,
      status: status,
      outputUrl,
      output: output ? JSON.stringify(output).substring(0, 500) : null,
      error: pollData.data?.error ? JSON.stringify(pollData.data.error).substring(0, 300) : null,
    });
  } catch (error: any) {
    res.json({ status: 'error', error: error.message });
  }
});

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
          const outputUrl = output?.video_url || output?.image_url || output?.audio_url ||
            (Array.isArray(output?.images) && output.images[0]?.url) ||
            (Array.isArray(output?.videos) && output.videos[0]?.url) ||
            output?.url || '';

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
