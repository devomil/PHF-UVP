import {
  deploySite,
  getFunctions,
  renderMediaOnLambda,
  getRenderProgress,
  AwsRegion,
} from "@remotion/lambda";
import {
  LambdaClient,
  GetFunctionConcurrencyCommand,
  PutFunctionConcurrencyCommand,
} from "@aws-sdk/client-lambda";
import path from "path";

const DEFAULT_REGION: AwsRegion = "us-east-2";
const DEFAULT_FUNCTION_NAME = "remotion-render-4-0-410-mem3008mb-disk10240mb-900sec";
const DEFAULT_SITE_NAME = "pinehillfarm-video";
const DEFAULT_BUCKET_NAME = "remotionlambda-useast2-1vc2l6a56o";
const DEFAULT_SERVE_URL = `https://${DEFAULT_BUCKET_NAME}.s3.${DEFAULT_REGION}.amazonaws.com/sites/${DEFAULT_SITE_NAME}/index.html`;

const getRegion = (): AwsRegion => (process.env.REMOTION_AWS_REGION as AwsRegion) || DEFAULT_REGION;
const getFunctionName = (): string => process.env.REMOTION_FUNCTION_NAME || DEFAULT_FUNCTION_NAME;
const getSiteName = (): string => process.env.REMOTION_SITE_NAME || DEFAULT_SITE_NAME;
const getBucketName = (): string => process.env.REMOTION_S3_BUCKET || process.env.REMOTION_AWS_BUCKET || DEFAULT_BUCKET_NAME;
const getServeUrl = (): string => process.env.REMOTION_SERVE_URL || DEFAULT_SERVE_URL;

interface DeploymentResult {
  functionName: string;
  bucketName: string;
  serveUrl: string;
}

interface RenderResult {
  renderId: string;
  bucketName: string;
}

interface RenderProgress {
  overallProgress: number;
  outputFile: string | null;
  errors: string[];
  done: boolean;
  fatalErrorEncountered: boolean;
  framesRendered: number;
  lambdasInvoked: number;
  chunks: number;
}

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'error';
  function?: {
    name: string;
    version?: string;
    memory?: number;
    timeout?: number;
    disk?: number;
  };
  region: string;
  serveUrl?: string;
  bucket?: string;
  timestamp: string;
  error?: string;
  expected?: string;
  available?: string[];
}

interface ConcurrencyInfo {
  functionName: string;
  reservedConcurrency: number | null;
  region: string;
}

class RemotionLambdaService {
  private get functionName(): string {
    return getFunctionName();
  }
  
  private get bucketName(): string {
    return getBucketName();
  }
  
  private get serveUrl(): string {
    return getServeUrl();
  }
  
  private get region(): AwsRegion {
    return getRegion();
  }

  private getAwsCredentials() {
    const accessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS credentials not configured. Please set REMOTION_AWS_ACCESS_KEY_ID and REMOTION_AWS_SECRET_ACCESS_KEY");
    }

    return { accessKeyId, secretAccessKey };
  }

  private getLambdaClient(): LambdaClient {
    const creds = this.getAwsCredentials();
    return new LambdaClient({
      region: this.region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
      },
    });
  }

  async isConfigured(): Promise<boolean> {
    try {
      this.getAwsCredentials();
      return true;
    } catch {
      return false;
    }
  }

  async getConcurrency(): Promise<ConcurrencyInfo> {
    const client = this.getLambdaClient();
    const command = new GetFunctionConcurrencyCommand({
      FunctionName: this.functionName,
    });

    try {
      const response = await client.send(command);
      const result = {
        functionName: this.functionName,
        reservedConcurrency: response.ReservedConcurrentExecutions ?? null,
        region: this.region,
      };
      console.log(`[Remotion Lambda] Concurrency for ${this.functionName}: ${result.reservedConcurrency ?? 'unreserved (uses account default)'}`);
      return result;
    } catch (error: any) {
      if (error.name === 'AccessDeniedException' || error.message?.includes('not authorized') || error.message?.includes('AccessDenied')) {
        console.warn(`[Remotion Lambda] IAM user lacks permission for GetFunctionConcurrency. Add lambda:GetFunctionConcurrency to the IAM policy.`);
        return {
          functionName: this.functionName,
          reservedConcurrency: null,
          region: this.region,
        };
      }
      console.error(`[Remotion Lambda] Failed to get concurrency:`, error.message);
      throw error;
    }
  }

  async setConcurrency(reservedConcurrentExecutions: number): Promise<ConcurrencyInfo> {
    const client = this.getLambdaClient();
    const command = new PutFunctionConcurrencyCommand({
      FunctionName: this.functionName,
      ReservedConcurrentExecutions: reservedConcurrentExecutions,
    });

    try {
      const response = await client.send(command);
      const result = {
        functionName: this.functionName,
        reservedConcurrency: response.ReservedConcurrentExecutions ?? null,
        region: this.region,
      };
      console.log(`[Remotion Lambda] Set concurrency for ${this.functionName} to ${result.reservedConcurrency}`);
      return result;
    } catch (error: any) {
      if (error.name === 'AccessDeniedException' || error.message?.includes('not authorized') || error.message?.includes('AccessDenied')) {
        console.warn(`[Remotion Lambda] IAM user lacks permission for PutFunctionConcurrency. Add lambda:PutFunctionConcurrency to the IAM policy.`);
        return {
          functionName: this.functionName,
          reservedConcurrency: null,
          region: this.region,
        };
      }
      console.error(`[Remotion Lambda] Failed to set concurrency:`, error.message);
      throw error;
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const region = this.region;
    const functionName = this.functionName;

    try {
      this.getAwsCredentials();

      // First try with compatibleOnly to find version-matched functions
      const compatibleFunctions = await getFunctions({
        region,
        compatibleOnly: true,
      });

      let ourFunction = compatibleFunctions.find(f => f.functionName === functionName);

      // If not found with compatibleOnly, try without - helps diagnose version mismatches
      if (!ourFunction) {
        console.warn(`[Health] Function ${functionName} not found with compatibleOnly=true, trying without filter...`);
        const allFunctions = await getFunctions({
          region,
          compatibleOnly: false,
        });

        ourFunction = allFunctions.find(f => f.functionName === functionName);

        if (ourFunction) {
          // Function exists but SDK version doesn't match
          console.error(`[Health] Function ${functionName} found but NOT compatible with installed SDK version 4.0.410`);
          console.error(`[Health] Function version: ${ourFunction.version}, SDK expects compatible version`);
          return {
            status: 'unhealthy',
            error: `Lambda function exists but is not compatible with SDK version 4.0.410. Function version: ${ourFunction.version}. Redeploy the function with matching version.`,
            expected: functionName,
            available: allFunctions.map(f => `${f.functionName} (v${f.version})`),
            function: {
              name: ourFunction.functionName,
              version: ourFunction.version ?? undefined,
              memory: ourFunction.memorySizeInMb,
              timeout: ourFunction.timeoutInSeconds,
              disk: ourFunction.diskSizeInMb,
            },
            region,
            timestamp: new Date().toISOString(),
          };
        }

        return {
          status: 'unhealthy',
          error: 'Lambda function not found in any version',
          expected: functionName,
          available: allFunctions.map(f => `${f.functionName} (v${f.version})`),
          region,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        status: 'healthy',
        function: {
          name: ourFunction.functionName,
          version: ourFunction.version ?? undefined,
          memory: ourFunction.memorySizeInMb,
          timeout: ourFunction.timeoutInSeconds,
          disk: ourFunction.diskSizeInMb,
        },
        region,
        serveUrl: this.serveUrl,
        bucket: this.bucketName,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('[Health] Check failed:', error);
      return {
        status: 'error',
        error: error.message,
        region,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getDeploymentStatus(): Promise<{
    deployed: boolean;
    functionName: string | null;
    bucketName: string | null;
    serveUrl: string | null;
    versionMismatch?: boolean;
  }> {
    try {
      this.getAwsCredentials();

      const functions = await getFunctions({
        region: this.region,
        compatibleOnly: true,
      });

      const existingFunction = functions.find(
        (f) => f.functionName === this.functionName
      );

      if (existingFunction) {
        return {
          deployed: true,
          functionName: this.functionName,
          bucketName: this.bucketName,
          serveUrl: this.serveUrl,
        };
      }

      // Check if function exists but with incompatible version
      const allFunctions = await getFunctions({
        region: this.region,
        compatibleOnly: false,
      });

      const incompatibleFunction = allFunctions.find(
        (f) => f.functionName === this.functionName
      );

      if (incompatibleFunction) {
        console.warn(`[Remotion Lambda] Function ${this.functionName} found but version ${incompatibleFunction.version} is not compatible with SDK 4.0.410`);
        return {
          deployed: true,
          functionName: this.functionName,
          bucketName: this.bucketName,
          serveUrl: this.serveUrl,
          versionMismatch: true,
        };
      }

      return {
        deployed: false,
        functionName: null,
        bucketName: null,
        serveUrl: null,
      };
    } catch (error) {
      console.error("[Remotion Lambda] Error checking deployment status:", error);
      return {
        deployed: false,
        functionName: null,
        bucketName: null,
        serveUrl: null,
      };
    }
  }

  async deploy(): Promise<DeploymentResult> {
    console.log("[Remotion Lambda] Using pre-deployed Lambda infrastructure...");
    console.log(`[Remotion Lambda] Function: ${this.functionName}`);
    console.log(`[Remotion Lambda] Bucket: ${this.bucketName}`);
    console.log(`[Remotion Lambda] ServeUrl: ${this.serveUrl}`);

    return {
      functionName: this.functionName,
      bucketName: this.bucketName,
      serveUrl: this.serveUrl,
    };
  }

  async redeploySite(): Promise<string> {
    console.log("[Remotion Lambda] Redeploying site to S3...");

    try {
      this.getAwsCredentials();

      const { serveUrl } = await deploySite({
        bucketName: this.bucketName,
        entryPoint: path.resolve(process.cwd(), "remotion/index.ts"),
        region: this.region,
        siteName: getSiteName(),
      });

      console.log(`[Remotion Lambda] Site redeployed: ${serveUrl}`);
      return serveUrl;
    } catch (error) {
      console.error("[Remotion Lambda] Site redeployment failed:", error);
      throw error;
    }
  }

  async startRender(params: {
    compositionId: string;
    inputProps: Record<string, any>;
    codec?: "h264" | "h265" | "vp8" | "vp9";
    imageFormat?: "jpeg" | "png";
  }): Promise<RenderResult> {
    this.getAwsCredentials();

    console.log(`[Remotion Lambda] Starting render for ${params.compositionId}...`);
    console.log(`[Remotion Lambda] Function: ${this.functionName}`);
    console.log(`[Remotion Lambda] ServeUrl: ${this.serveUrl}`);
    console.log(`[Remotion Lambda] Input props:`, JSON.stringify(params.inputProps).substring(0, 500));
    
    console.log('[DEBUG] Scenes being rendered:', JSON.stringify(params.inputProps.scenes?.map((s: any) => ({
      id: s.id,
      type: s.type,
      bgType: s.background?.type,
      hasVideo: !!s.assets?.videoUrl,
      hasImage: !!s.assets?.imageUrl
    })), null, 2));

    const maxRetries = 5;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Validate inputProps size before sending to Lambda (6MB async payload limit)
        const inputPropsJson = JSON.stringify(params.inputProps);
        const inputPropsSizeKB = Math.round(inputPropsJson.length / 1024);
        console.log(`[Remotion Lambda] Input props size: ${inputPropsSizeKB} KB`);
        if (inputPropsSizeKB > 5000) {
          console.warn(`[Remotion Lambda] WARNING: Input props are ${inputPropsSizeKB} KB - near Lambda 6MB payload limit!`);
        }

        const result = await renderMediaOnLambda({
          region: this.region,
          functionName: this.functionName,
          serveUrl: this.serveUrl,
          composition: params.compositionId,
          inputProps: params.inputProps,
          codec: params.codec || "h264",
          imageFormat: params.imageFormat || "jpeg",
          maxRetries: 3,
          privacy: "public",
          framesPerLambda: 120,
          concurrencyPerLambda: 1,
          timeoutInMilliseconds: 840000, // 14 min - leave buffer before 15min Lambda timeout
          chromiumOptions: {
            gl: 'angle',
          },
          downloadBehavior: {
            type: "download",
            fileName: `${params.compositionId}-${Date.now()}.mp4`,
          },
        });

        console.log(`[Remotion Lambda] Render started: ${result.renderId}`);

        return {
          renderId: result.renderId,
          bucketName: result.bucketName,
        };
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || String(error);
        
        const isConcurrencyError = 
          errorMessage.includes('Concurrency limit') ||
          errorMessage.includes('Rate Exceeded') ||
          errorMessage.includes('TooManyRequestsException') ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('ConcurrentInvocationLimitExceeded');

        if (isConcurrencyError && attempt < maxRetries) {
          const delay = Math.min(30000 * Math.pow(2, attempt - 1), 120000);
          console.log(`[Remotion Lambda] Rate limit hit (attempt ${attempt}/${maxRetries}), waiting ${delay/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        console.error(`[Remotion Lambda] Render failed to start (attempt ${attempt}/${maxRetries}):`, error);
        
        if (isConcurrencyError) {
          throw new Error(`AWS Lambda rate limited after ${maxRetries} attempts. Please wait and try again. Consider increasing reserved concurrency.`);
        }
        throw error;
      }
    }

    throw lastError || new Error("Render failed after all retries");
  }

  async getRenderProgress(renderId: string, bucketName: string): Promise<RenderProgress> {
    try {
      const progress = await getRenderProgress({
        renderId,
        bucketName,
        functionName: this.functionName,
        region: this.region,
      });

      // Log detailed progress for debugging
      if (progress.fatalErrorEncountered) {
        console.error(`[Remotion Lambda] FATAL ERROR in render ${renderId}:`,
          JSON.stringify(progress.errors.map(e => ({ message: e.message, name: e.name, chunk: e.chunk })), null, 2));
      }

      return {
        overallProgress: progress.overallProgress,
        outputFile: progress.outputFile,
        errors: progress.errors.map((e) => e.message),
        done: progress.done,
        fatalErrorEncountered: progress.fatalErrorEncountered,
        framesRendered: progress.framesRendered,
        lambdasInvoked: progress.lambdasInvoked,
        chunks: progress.chunks,
      };
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      const isRateLimit = 
        errorMsg.includes('Rate Exceeded') ||
        errorMsg.includes('TooManyRequestsException') ||
        errorMsg.includes('ConcurrentInvocationLimitExceeded');

      if (isRateLimit) {
        console.warn(`[Remotion Lambda] Progress poll rate limited for render ${renderId}, will retry`);
      } else {
        console.error("[Remotion Lambda] Error getting render progress:", error);
      }
      throw error;
    }
  }

  async pollRenderToCompletion(
    renderId: string,
    bucketName: string,
    onPollProgress?: (percent: number) => void
  ): Promise<string> {
    console.log(`[Remotion Lambda] Polling render ${renderId} to completion...`);

    let consecutiveRateLimits = 0;
    const maxConsecutiveRateLimits = 20;
    let pollInterval = 8000;

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      let progress: RenderProgress;
      try {
        progress = await this.getRenderProgress(renderId, bucketName);
        consecutiveRateLimits = 0;
        pollInterval = 8000;
      } catch (pollError: any) {
        const errorMsg = pollError?.message || String(pollError);
        const isRateLimit = 
          errorMsg.includes('Rate Exceeded') ||
          errorMsg.includes('TooManyRequestsException') ||
          errorMsg.includes('ConcurrentInvocationLimitExceeded') ||
          errorMsg.includes('rate limit');

        if (isRateLimit) {
          consecutiveRateLimits++;
          if (consecutiveRateLimits >= maxConsecutiveRateLimits) {
            throw new Error(`Progress polling rate limited ${maxConsecutiveRateLimits} times consecutively for render ${renderId}. The render may still be running on Lambda.`);
          }
          pollInterval = Math.min(10000 * Math.pow(1.5, consecutiveRateLimits - 1), 60000);
          console.log(`[Remotion Lambda] Progress poll rate limited (${consecutiveRateLimits}/${maxConsecutiveRateLimits}), backing off to ${(pollInterval/1000).toFixed(1)}s for render ${renderId}`);
          continue;
        }
        throw pollError;
      }

      const pct = Math.round(progress.overallProgress * 100);
      console.log(`[Remotion Lambda] Progress: ${pct}% (frames: ${progress.framesRendered}, lambdas: ${progress.lambdasInvoked}, chunks: ${progress.chunks})`);

      if (onPollProgress) {
        try { onPollProgress(pct); } catch {}
      }

      // Check for fatal error flag (can be true even if errors array is empty)
      if (progress.fatalErrorEncountered) {
        const errorText = progress.errors.length > 0 ? progress.errors.join(", ") : "Fatal error encountered in Lambda render";
        console.error(`[Remotion Lambda] FATAL: Render ${renderId} encountered fatal error: ${errorText}`);
        throw new Error(`Render fatal error: ${errorText}`);
      }

      if (progress.errors.length > 0) {
        const errorText = progress.errors.join(", ");
        const isRateLimitInRender =
          errorText.includes('Rate Exceeded') ||
          errorText.includes('Concurrency limit') ||
          errorText.includes('TooManyRequestsException') ||
          errorText.includes('ConcurrentInvocationLimitExceeded');

        if (isRateLimitInRender) {
          console.warn(`[Remotion Lambda] Render ${renderId} failed due to AWS rate limiting inside Lambda: ${errorText}`);
          throw new Error(`Rate Exceeded during Lambda render: ${errorText}`);
        }
        throw new Error(`Render failed: ${errorText}`);
      }

      if (progress.done && progress.outputFile) {
        console.log(`[Remotion Lambda] Render complete: ${progress.outputFile}`);
        return progress.outputFile;
      }

      if (progress.done && !progress.outputFile) {
        throw new Error("Render completed but no output file was generated");
      }
    }
  }

  async renderVideo(params: {
    compositionId: string;
    inputProps: Record<string, any>;
    codec?: "h264" | "h265" | "vp8" | "vp9";
    onPollProgress?: (percent: number) => void;
  }): Promise<string> {
    const { renderId, bucketName } = await this.startRender(params);
    return this.pollRenderToCompletion(renderId, bucketName, params.onPollProgress);
  }

  getDefaultBucketName(): string {
    return this.bucketName;
  }
}

export const remotionLambdaService = new RemotionLambdaService();
