import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";

interface TestDefinition {
  id: string;
  name: string;
  category: string;
  model: string;
  taskType: string;
  estimatedCost: string;
  estimatedTime: string;
  notes?: string;
}

interface TestState {
  status: "idle" | "submitting" | "polling" | "pass" | "fail" | "timeout";
  taskId?: string;
  responseTime?: number;
  outputUrl?: string;
  outputText?: string;
  error?: string;
}

const categoryConfig = {
  video: { label: "Video Generation", icon: Video, color: "purple" },
  image: { label: "Image Generation", icon: Image, color: "blue" },
  audio: { label: "Audio Generation", icon: Music, color: "green" },
  llm: { label: "LLM", icon: MessageSquare, color: "amber" },
};

export default function ApiTesting() {
  const [definitions, setDefinitions] = useState<Record<string, TestDefinition[]>>({});
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/piapi-tests/definitions")
      .then((r) => r.json())
      .then((data) => {
        setDefinitions(data.definitions || {});
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

  const pollTask = useCallback(
    async (testId: string, taskId: string, startTime: number) => {
      const maxPollTime = 180000;
      const pollInterval = 3000;

      const poll = async () => {
        if (Date.now() - startTime > maxPollTime) {
          updateTestState(testId, {
            status: "timeout",
            responseTime: Date.now() - startTime,
            error: "Exceeded 3 minute timeout",
          });
          return;
        }

        try {
          const res = await fetch(`/api/piapi-tests/poll/${taskId}`);
          const data = await res.json();

          if (data.status === "completed" || data.status === "success" || data.status === "succeeded") {
            updateTestState(testId, {
              status: "pass",
              responseTime: Date.now() - startTime,
              outputUrl: data.outputUrl || undefined,
            });
            return;
          }

          if (data.status === "failed" || data.status === "error" || data.status === "cancelled") {
            updateTestState(testId, {
              status: "fail",
              responseTime: Date.now() - startTime,
              error: data.error || "Task failed",
            });
            return;
          }

          setTimeout(poll, pollInterval);
        } catch {
          setTimeout(poll, pollInterval);
        }
      };

      setTimeout(poll, pollInterval);
    },
    [updateTestState]
  );

  const runTest = useCallback(
    async (testId: string) => {
      const startTime = Date.now();
      updateTestState(testId, { status: "submitting", error: undefined, outputUrl: undefined, outputText: undefined });

      try {
        const res = await fetch(`/api/piapi-tests/submit/${testId}`, { method: "POST" });
        const data = await res.json();

        if (data.status === "fail") {
          updateTestState(testId, {
            status: "fail",
            responseTime: Date.now() - startTime,
            error: data.error,
          });
          return;
        }

        if (data.status === "pass") {
          updateTestState(testId, {
            status: "pass",
            responseTime: data.responseTime || Date.now() - startTime,
            outputUrl: data.outputUrl,
            outputText: data.outputText,
          });
          return;
        }

        if (data.taskId) {
          updateTestState(testId, {
            status: "polling",
            taskId: data.taskId,
          });
          pollTask(testId, data.taskId, startTime);
        } else {
          updateTestState(testId, {
            status: "fail",
            responseTime: Date.now() - startTime,
            error: data.error || "No task ID returned",
          });
        }
      } catch (err: any) {
        updateTestState(testId, {
          status: "fail",
          responseTime: Date.now() - startTime,
          error: err.message,
        });
      }
    },
    [updateTestState, pollTask]
  );

  const runCategory = useCallback(
    async (category: string) => {
      const tests = definitions[category] || [];
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
        return <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: "var(--text-tertiary)" }} />;
      case "submitting":
      case "polling":
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case "pass":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case "fail":
        return <XCircle className="w-4 h-4 text-red-400" />;
      case "timeout":
        return <Clock className="w-4 h-4 text-amber-400" />;
    }
  };

  const getStatusLabel = (status: TestState["status"]) => {
    switch (status) {
      case "idle": return "Not tested";
      case "submitting": return "Submitting...";
      case "polling": return "Processing...";
      case "pass": return "Passed";
      case "fail": return "Failed";
      case "timeout": return "Timeout";
    }
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
          className="border rounded-xl p-3 mb-6 flex items-center gap-2"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
        >
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Each test makes a real API call. Video tests may take 1-3 minutes to complete.
            Estimated total cost to test everything: ~$5-8.
          </p>
        </div>

        {(["video", "image", "audio", "llm"] as const).map((category) => {
          const config = categoryConfig[category];
          const tests = definitions[category] || [];
          const Icon = config.icon;

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
                </div>
                <button
                  onClick={() => runCategory(category)}
                  disabled={catRunning > 0}
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
                      Test All {config.label}
                    </>
                  )}
                </button>
              </div>

              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {tests.map((test) => {
                  const state = testStates[test.id] || { status: "idle" as const };
                  const isRunning = state.status === "submitting" || state.status === "polling";

                  return (
                    <div
                      key={test.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:brightness-105 transition-colors"
                      style={{ backgroundColor: "var(--app-bg)" }}
                    >
                      <div className="shrink-0">{getStatusIcon(state.status)}</div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{test.name}</span>
                          <code
                            className="text-[10px] px-1.5 py-0.5 rounded font-mono hidden sm:inline-block"
                            style={{ backgroundColor: "var(--surface-hover)", color: "var(--text-tertiary)" }}
                          >
                            {test.model}
                          </code>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                            {getStatusLabel(state.status)}
                          </span>
                          {state.responseTime && (
                            <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                              {(state.responseTime / 1000).toFixed(1)}s
                            </span>
                          )}
                          {state.error && (
                            <span className="text-[11px] text-red-400 truncate max-w-[300px]" title={state.error}>
                              {state.error}
                            </span>
                          )}
                          {state.outputText && (
                            <span className="text-[11px] text-emerald-400 truncate max-w-[200px]">
                              {state.outputText}
                            </span>
                          )}
                          {state.outputUrl && (
                            <a
                              href={state.outputUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                            >
                              View output <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
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
                        disabled={isRunning}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          borderColor: "var(--border-subtle)",
                          backgroundColor: "var(--surface)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {isRunning ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : state.status === "pass" || state.status === "fail" || state.status === "timeout" ? (
                          <RefreshCw className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        {isRunning ? "..." : state.status !== "idle" ? "Retest" : "Test"}
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
