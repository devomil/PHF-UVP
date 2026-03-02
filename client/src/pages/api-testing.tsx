import { useState, useEffect, useCallback, useRef } from "react";
import {
  FlaskConical,
  Video,
  Image,
  Music,
  MessageSquare,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Zap,
  Upload,
  Trash2,
  ImageIcon,
  Clapperboard,
  Paintbrush,
  RotateCcw,
  Repeat,
  Wrench,
  User,
  Film,
} from "lucide-react";

interface TestDefinition {
  id: string;
  name: string;
  category: string;
  model: string;
  taskType: string;
  estimatedCost: string;
  estimatedTime: string;
  timeoutMs?: number;
  notes?: string;
  requiresImage?: boolean;
  requiresVideo?: boolean;
  input?: Record<string, any>;
  endpoint?: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface TestState {
  status: "idle" | "submitting" | "polling" | "pass" | "fail" | "timeout";
  taskId?: string;
  responseTime?: number;
  outputUrl?: string;
  outputText?: string;
  error?: string;
  testedAt?: string;
}

const categoryConfig: Record<string, { label: string; icon: any; color: string; description: string }> = {
  video: { label: "Video Generation (T2V)", icon: Video, color: "purple", description: "Text-to-Video" },
  i2v: { label: "Image-to-Video (I2V)", icon: Clapperboard, color: "indigo", description: "Image-to-Video — requires test image" },
  v2v: { label: "Video-to-Video (V2V)", icon: Repeat, color: "pink", description: "Video-to-Video — requires test video" },
  "character-performance": { label: "Character Performance", icon: User, color: "rose", description: "Runway Act Two — requires test image + test video" },
  image: { label: "Image Generation (T2I)", icon: Image, color: "blue", description: "Text-to-Image" },
  i2i: { label: "Image-to-Image (I2I)", icon: Paintbrush, color: "cyan", description: "Image-to-Image — requires test image" },
  toolkit: { label: "Toolkit (Upscale / BG Remove)", icon: Wrench, color: "teal", description: "Image & video upscaling and background removal" },
  audio: { label: "Audio Generation", icon: Music, color: "green", description: "Text-to-Audio / Music" },
  llm: { label: "LLM", icon: MessageSquare, color: "amber", description: "Large Language Models" },
};

const categoryOrder = ["video", "i2v", "v2v", "character-performance", "image", "i2i", "toolkit", "audio", "llm"];

export default function ApiTesting() {
  const [definitions, setDefinitions] = useState<Record<string, TestDefinition[]>>({});
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});
  const [loading, setLoading] = useState(true);
  const [testImageUrl, setTestImageUrl] = useState<string | null>(null);
  const [testVideoUrl, setTestVideoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/piapi-tests/definitions").then((r) => r.json()),
      fetch("/api/piapi-tests/results").then((r) => r.json()),
    ])
      .then(([defData, resultsData]) => {
        setDefinitions(defData.definitions || {});
        setTestImageUrl(defData.testImageUrl || null);
        setTestVideoUrl(defData.testVideoUrl || null);
        if (resultsData.results) {
          const savedStates: Record<string, TestState> = {};
          for (const r of resultsData.results) {
            savedStates[r.test_id] = {
              status: r.status as TestState["status"],
              responseTime: r.response_time || undefined,
              taskId: r.task_id || undefined,
              outputUrl: r.output_url || undefined,
              outputText: r.output_text || undefined,
              error: r.error || undefined,
              testedAt: r.tested_at,
            };
          }
          setTestStates(savedStates);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updateTestState = useCallback((id: string, update: Partial<TestState>) => {
    setTestStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { status: "idle" }), ...update },
    }));
  }, []);

  const saveTestResult = useCallback(
    async (testId: string, state: Partial<TestState>, testDef?: TestDefinition) => {
      const finalStatus = state.status;
      if (!finalStatus || finalStatus === "submitting" || finalStatus === "polling" || finalStatus === "idle") return;
      try {
        const allDefs = Object.values(definitions).flat();
        const def = testDef || allDefs.find((d) => d.id === testId);
        const saveRes = await fetch("/api/piapi-tests/results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            testId,
            testName: def?.name || testId,
            category: def?.category || "unknown",
            status: finalStatus,
            responseTime: state.responseTime || null,
            taskId: state.taskId || null,
            outputUrl: state.outputUrl || null,
            outputText: state.outputText || null,
            error: state.error || null,
          }),
        });
        const saveData = await saveRes.json();
        setTestStates((prev) => ({
          ...prev,
          [testId]: { ...prev[testId], testedAt: saveData.testedAt || new Date().toISOString() },
        }));
      } catch {
      }
    },
    [definitions]
  );

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/piapi-tests/upload-test-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setTestImageUrl(data.imageUrl);
      }
    } catch (err) {
      console.error("Upload failed:", err);
    }
    setUploading(false);
  };

  const handleDeleteImage = async () => {
    try {
      await fetch("/api/piapi-tests/test-image", { method: "DELETE" });
      setTestImageUrl(null);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleVideoUpload = async (file: File) => {
    setUploadingVideo(true);
    const formData = new FormData();
    formData.append("video", file);
    try {
      const res = await fetch("/api/piapi-tests/upload-test-video", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setTestVideoUrl(data.videoUrl);
      }
    } catch (err) {
      console.error("Video upload failed:", err);
    }
    setUploadingVideo(false);
  };

  const handleDeleteVideo = async () => {
    try {
      await fetch("/api/piapi-tests/test-video", { method: "DELETE" });
      setTestVideoUrl(null);
    } catch (err) {
      console.error("Video delete failed:", err);
    }
  };

  const pollTask = useCallback(
    async (testId: string, taskId: string, startTime: number, timeoutMs?: number) => {
      const maxPollTime = timeoutMs || 180000;
      const pollInterval = 3000;
      const timeoutLabel = maxPollTime >= 60000 ? `${Math.round(maxPollTime / 60000)} minute` : `${Math.round(maxPollTime / 1000)}s`;

      const poll = async () => {
        if (Date.now() - startTime > maxPollTime) {
          const result = {
            status: "timeout" as const,
            responseTime: Date.now() - startTime,
            error: `Exceeded ${timeoutLabel} timeout`,
            taskId,
          };
          updateTestState(testId, result);
          saveTestResult(testId, result);
          return;
        }

        try {
          const res = await fetch(`/api/piapi-tests/poll/${taskId}?testId=${testId}`);
          const data = await res.json();

          if (data.status === "completed" || data.status === "success" || data.status === "succeeded") {
            const result = {
              status: "pass" as const,
              responseTime: Date.now() - startTime,
              outputUrl: data.outputUrl || undefined,
              taskId,
            };
            updateTestState(testId, result);
            saveTestResult(testId, result);
            return;
          }

          if (data.status === "failed" || data.status === "error" || data.status === "cancelled") {
            const result = {
              status: "fail" as const,
              responseTime: Date.now() - startTime,
              error: data.error || "Task failed",
              taskId,
            };
            updateTestState(testId, result);
            saveTestResult(testId, result);
            return;
          }

          setTimeout(poll, pollInterval);
        } catch {
          setTimeout(poll, pollInterval);
        }
      };

      setTimeout(poll, pollInterval);
    },
    [updateTestState, saveTestResult]
  );

  const runTest = useCallback(
    async (testId: string) => {
      const startTime = Date.now();
      updateTestState(testId, { status: "submitting", error: undefined, outputUrl: undefined, outputText: undefined, testedAt: undefined });

      const allTests = Object.values(definitions).flat();
      const testDef = allTests.find((t) => t.id === testId);
      const testTimeout = testDef?.timeoutMs;

      try {
        const res = await fetch(`/api/piapi-tests/submit/${testId}`, { method: "POST" });
        const data = await res.json();

        if (data.status === "fail") {
          const result = {
            status: "fail" as const,
            responseTime: Date.now() - startTime,
            error: data.error,
          };
          updateTestState(testId, result);
          saveTestResult(testId, result);
          return;
        }

        if (data.status === "pass") {
          const result = {
            status: "pass" as const,
            responseTime: data.responseTime || Date.now() - startTime,
            outputUrl: data.outputUrl,
            outputText: data.outputText,
          };
          updateTestState(testId, result);
          saveTestResult(testId, result);
          return;
        }

        if (data.taskId) {
          updateTestState(testId, {
            status: "polling",
            taskId: data.taskId,
          });
          pollTask(testId, data.taskId, startTime, testTimeout);
        } else {
          const result = {
            status: "fail" as const,
            responseTime: Date.now() - startTime,
            error: data.error || "No task ID returned",
          };
          updateTestState(testId, result);
          saveTestResult(testId, result);
        }
      } catch (err: any) {
        const result = {
          status: "fail" as const,
          responseTime: Date.now() - startTime,
          error: err.message,
        };
        updateTestState(testId, result);
        saveTestResult(testId, result);
      }
    },
    [updateTestState, pollTask, saveTestResult]
  );

  const runCategory = useCallback(
    async (category: string) => {
      const tests = (definitions[category] || []).filter((t) => !t.disabled);
      for (const test of tests) {
        await runTest(test.id);
        await new Promise((r) => setTimeout(r, 500));
      }
    },
    [definitions, runTest]
  );

  const getStatusIcon = (status: TestState["status"]) => {
    switch (status) {
      case "idle":
        return <div className="w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: "var(--text-tertiary)" }} />;
      case "submitting":
      case "polling":
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case "pass":
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case "fail":
        return <XCircle className="w-5 h-5 text-red-400" />;
      case "timeout":
        return <Clock className="w-5 h-5 text-amber-400" />;
    }
  };

  const getStatusBadge = (status: TestState["status"]) => {
    switch (status) {
      case "idle": return null;
      case "submitting": return { label: "Submitting...", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.3)", color: "rgb(96,165,250)" };
      case "polling": return { label: "Processing...", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.3)", color: "rgb(96,165,250)" };
      case "pass": return { label: "Passed", bg: "rgba(52,211,153,0.15)", border: "rgba(52,211,153,0.3)", color: "rgb(52,211,153)" };
      case "fail": return { label: "Failed", bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.3)", color: "rgb(248,113,113)" };
      case "timeout": return { label: "Timeout", bg: "rgba(251,191,36,0.15)", border: "rgba(251,191,36,0.3)", color: "rgb(251,191,36)" };
    }
  };

  const getRowStyle = (status: TestState["status"]): React.CSSProperties => {
    switch (status) {
      case "pass": return { backgroundColor: "rgba(52,211,153,0.05)", borderLeft: "3px solid rgb(52,211,153)" };
      case "fail": return { backgroundColor: "rgba(248,113,113,0.05)", borderLeft: "3px solid rgb(248,113,113)" };
      case "timeout": return { backgroundColor: "rgba(251,191,36,0.05)", borderLeft: "3px solid rgb(251,191,36)" };
      case "submitting":
      case "polling": return { backgroundColor: "rgba(96,165,250,0.05)", borderLeft: "3px solid rgb(96,165,250)" };
      default: return { backgroundColor: "var(--app-bg)", borderLeft: "3px solid transparent" };
    }
  };

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getSummary = () => {
    const allTests = Object.values(definitions).flat();
    const states = allTests.map((t) => testStates[t.id]?.status || "idle");
    return {
      total: allTests.length,
      passed: states.filter((s) => s === "pass").length,
      failed: states.filter((s) => s === "fail").length,
      timeout: states.filter((s) => s === "timeout").length,
      running: states.filter((s) => s === "submitting" || s === "polling").length,
      idle: states.filter((s) => s === "idle").length,
    };
  };

  const summary = getSummary();
  const requiresImageCategories = ["i2v", "i2i", "character-performance"];
  const requiresVideoCategories = ["v2v", "character-performance"];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <FlaskConical className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">PiAPI Service Testing</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Test and verify all AI API services available through your PiAPI key
            </p>
          </div>
        </div>

        <div
          className="border rounded-xl p-4 mb-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
        >
          <SummaryCard label="Total" value={summary.total} color="var(--text-primary)" />
          <SummaryCard label="Passed" value={summary.passed} color="rgb(52, 211, 153)" />
          <SummaryCard label="Failed" value={summary.failed} color="rgb(248, 113, 113)" />
          <SummaryCard label="Timeout" value={summary.timeout} color="rgb(251, 191, 36)" />
          <SummaryCard label="Running" value={summary.running} color="rgb(96, 165, 250)" />
          <SummaryCard label="Not Tested" value={summary.idle} color="var(--text-tertiary)" />
        </div>

        <div
          className="border rounded-xl p-3 mb-4 flex items-center gap-2"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
        >
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>
            Each test makes a real API call. Video tests may take 1-3 minutes to complete.
            Estimated total cost to test everything: ~$8-12. Results are saved automatically.
          </p>
          {summary.total - summary.idle > 0 && (
            <button
              onClick={async () => {
                if (!confirm("Clear all saved test results?")) return;
                await fetch("/api/piapi-tests/results", { method: "DELETE" });
                setTestStates({});
              }}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors hover:brightness-110"
              style={{
                borderColor: "var(--border-subtle)",
                backgroundColor: "var(--surface-hover)",
                color: "var(--text-secondary)",
              }}
            >
              <RotateCcw className="w-3 h-3" />
              Clear Results
            </button>
          )}
        </div>

        <div
          className="border rounded-xl p-4 mb-6"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold">Test Image for I2V & I2I</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Required for image-based tests
            </span>
          </div>

          {testImageUrl ? (
            <div className="flex items-center gap-4">
              <div className="relative group">
                <img
                  src={testImageUrl}
                  alt="Test image"
                  className="w-20 h-20 object-cover rounded-lg border"
                  style={{ borderColor: "var(--border-subtle)" }}
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                  <button
                    onClick={handleDeleteImage}
                    className="p-1.5 rounded-full bg-red-500/80 hover:bg-red-500 text-white"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Image uploaded
                </p>
                <p className="text-[11px] mt-0.5 break-all" style={{ color: "var(--text-tertiary)" }}>
                  {testImageUrl}
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] px-2 py-1 rounded border transition-colors hover:brightness-110"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--surface-hover)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Replace Image
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:brightness-110 transition-all"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--app-bg)" }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith("image/")) {
                  handleImageUpload(file);
                }
              }}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Uploading...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-6 h-6 text-indigo-400" />
                  <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                    Upload a test image (logo, photo, etc.)
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    Click or drag & drop. JPEG, PNG, WebP, or GIF (max 10MB).
                    This image will be used for all I2V and I2I tests.
                  </span>
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageUpload(file);
              e.target.value = "";
            }}
          />
        </div>

        <div
          className="border rounded-xl p-4 mb-6"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Film className="w-4 h-4 text-pink-400" />
            <span className="text-sm font-semibold">Test Video for V2V, Character Performance & Toolkit</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
              Required for video-based tests
            </span>
          </div>

          {testVideoUrl ? (
            <div className="flex items-center gap-4">
              <div className="relative group">
                <video
                  src={testVideoUrl}
                  className="w-28 h-20 object-cover rounded-lg border"
                  style={{ borderColor: "var(--border-subtle)" }}
                  muted
                  loop
                  playsInline
                  onMouseOver={(e) => (e.target as HTMLVideoElement).play()}
                  onMouseOut={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                  <button
                    onClick={handleDeleteVideo}
                    className="p-1.5 rounded-full bg-red-500/80 hover:bg-red-500 text-white"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Video uploaded
                </p>
                <p className="text-[11px] mt-0.5 break-all" style={{ color: "var(--text-tertiary)" }}>
                  {testVideoUrl}
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    className="text-[11px] px-2 py-1 rounded border transition-colors hover:brightness-110"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--surface-hover)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Replace Video
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:brightness-110 transition-all"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--app-bg)" }}
              onClick={() => videoInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith("video/")) {
                  handleVideoUpload(file);
                }
              }}
            >
              {uploadingVideo ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 text-pink-400 animate-spin" />
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Uploading video...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-6 h-6 text-pink-400" />
                  <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                    Upload a test video (short clip, performance reference, etc.)
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    Click or drag & drop. MP4, WebM, MOV, or AVI (max 100MB).
                    This video will be used for V2V, Character Performance, and Toolkit tests.
                  </span>
                </div>
              )}
            </div>
          )}

          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleVideoUpload(file);
              e.target.value = "";
            }}
          />
        </div>

        {categoryOrder.map((category) => {
          const config = categoryConfig[category];
          if (!config) return null;
          const tests = definitions[category] || [];
          if (tests.length === 0) return null;
          const Icon = config.icon;
          const needsImage = requiresImageCategories.includes(category);
          const needsVideo = requiresVideoCategories.includes(category);
          const hasImage = !!testImageUrl;
          const hasVideo = !!testVideoUrl;

          const catStates = tests.map((t) => testStates[t.id]?.status || "idle");
          const catPassed = catStates.filter((s) => s === "pass").length;
          const catFailed = catStates.filter((s) => s === "fail").length;
          const catRunning = catStates.filter((s) => s === "submitting" || s === "polling").length;

          return (
            <div
              key={category}
              className="border rounded-xl mb-4 overflow-hidden"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ backgroundColor: "var(--surface)" }}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 text-${config.color}-400`} />
                  <span className="font-semibold text-sm">{config.label}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "var(--surface-hover)", color: "var(--text-secondary)" }}
                  >
                    {tests.length} services
                  </span>
                  {catPassed > 0 && (
                    <span className="text-xs text-emerald-400">{catPassed} passed</span>
                  )}
                  {catFailed > 0 && (
                    <span className="text-xs text-red-400">{catFailed} failed</span>
                  )}
                  {needsImage && !hasImage && (
                    <span className="text-xs text-amber-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Needs image
                    </span>
                  )}
                  {needsVideo && !hasVideo && (
                    <span className="text-xs text-pink-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Needs video
                    </span>
                  )}
                </div>
                <button
                  onClick={() => runCategory(category)}
                  disabled={catRunning > 0 || (needsImage && !hasImage) || (needsVideo && !hasVideo)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {catRunning > 0 ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3" />
                      Test All {config.label.split("(")[0].trim()}
                    </>
                  )}
                </button>
              </div>

              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {tests.map((test) => {
                  const state = testStates[test.id] || { status: "idle" as const };
                  const isRunning = state.status === "submitting" || state.status === "polling";
                  const testNeedsImage = test.requiresImage;
                  const testNeedsVideo = test.requiresVideo;
                  const isDisabled = isRunning || (testNeedsImage && !hasImage) || (testNeedsVideo && !hasVideo) || !!test.disabled;
                  const badge = getStatusBadge(state.status);
                  const hasFinalResult = state.status === "pass" || state.status === "fail" || state.status === "timeout";
                  const prompt = test.input?.prompt
                    || test.input?.messages?.[0]?.content
                    || test.input?.text
                    || test.input?.lyrics
                    || null;

                  return (
                    <div
                      key={test.id}
                      className="flex items-center gap-3 px-4 py-3 transition-colors"
                      style={getRowStyle(state.status)}
                    >
                      <div className="shrink-0">{getStatusIcon(state.status)}</div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{test.name}</span>
                          <code
                            className="text-[10px] px-1.5 py-0.5 rounded font-mono hidden sm:inline-block"
                            style={{ backgroundColor: "var(--surface-hover)", color: "var(--text-tertiary)" }}
                          >
                            {test.model}
                          </code>
                          {test.requiresImage && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              IMG
                            </span>
                          )}
                          {test.requiresVideo && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">
                              VID
                            </span>
                          )}
                          {test.disabled && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                              UNAVAILABLE
                            </span>
                          )}
                          {badge && (
                            <span
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                              style={{ backgroundColor: badge.bg, borderColor: badge.border, color: badge.color }}
                            >
                              {badge.label}
                            </span>
                          )}
                        </div>

                        {prompt && (
                          <p
                            className="text-[11px] mt-1 leading-relaxed italic truncate max-w-[500px]"
                            style={{ color: "var(--text-secondary)" }}
                            title={typeof prompt === "string" ? prompt : JSON.stringify(prompt)}
                          >
                            &ldquo;{typeof prompt === "string" ? prompt : JSON.stringify(prompt)}&rdquo;
                          </p>
                        )}

                        {state.status === "idle" && !prompt && (
                          <div className="mt-0.5">
                            <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Not tested</span>
                          </div>
                        )}

                        {hasFinalResult && (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {state.testedAt && (
                              <span
                                className="text-[11px] px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                                style={{ backgroundColor: "var(--surface-hover)", color: "var(--text-secondary)" }}
                                title={new Date(state.testedAt).toLocaleString()}
                              >
                                <Clock className="w-3 h-3" />
                                {formatTimeAgo(state.testedAt)}
                              </span>
                            )}
                            {state.responseTime != null && state.responseTime > 0 && (
                              <span
                                className="text-[11px] px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: "var(--surface-hover)", color: "var(--text-secondary)" }}
                              >
                                {(state.responseTime / 1000).toFixed(1)}s
                              </span>
                            )}
                            {state.error && (
                              <span className="text-[11px] text-red-400 truncate max-w-[400px]" title={state.error}>
                                {state.error}
                              </span>
                            )}
                            {state.outputText && (
                              <span className="text-[11px] text-emerald-300 truncate max-w-[250px]">
                                {state.outputText}
                              </span>
                            )}
                            {state.outputUrl && (
                              <a
                                href={state.outputUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:text-blue-300 hover:bg-blue-500/25 flex items-center gap-1 transition-colors"
                              >
                                View Output <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            {!state.outputUrl && state.taskId && state.status === "pass" && (
                              <a
                                href={`/api/piapi-tests/task-output/${state.taskId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-400 hover:text-purple-300 hover:bg-purple-500/25 flex items-center gap-1 transition-colors"
                              >
                                View Output <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        )}

                        {isRunning && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] text-blue-400 animate-pulse">
                              {state.status === "submitting" ? "Submitting to PiAPI..." : "Waiting for result..."}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="hidden md:flex items-center gap-3 shrink-0">
                        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          ~{test.estimatedCost}
                        </span>
                        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          {test.estimatedTime}
                        </span>
                      </div>

                      <button
                        onClick={() => runTest(test.id)}
                        disabled={isDisabled}
                        title={test.disabled ? (test.disabledReason || 'This test is currently unavailable') : undefined}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          borderColor: hasFinalResult ? "var(--border-subtle)" : "var(--border-subtle)",
                          backgroundColor: hasFinalResult ? "var(--surface-hover)" : "var(--surface)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {isRunning ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : hasFinalResult ? (
                          <RefreshCw className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        {test.disabled ? "N/A" : isRunning ? "Testing..." : hasFinalResult ? "Retest" : "Test"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
    </div>
  );
}
