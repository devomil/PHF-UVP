import { Activity, CheckCircle2, XCircle, Clock, RotateCcw, Loader2, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function RenderQueue() {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["render-queue"],
    queryFn: async () => {
      const res = await fetch("/api/render-queue", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch render queue");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const activeJobs = jobs.filter((j: any) => ["pending", "processing", "generating", "rendering"].includes(j.status));
  const completedJobs = jobs.filter((j: any) => j.status === "completed");
  const failedJobs = jobs.filter((j: any) => j.status === "failed");

  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Activity className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Render Queue</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Monitor your video rendering jobs</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--text-muted)" }} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="border rounded-xl p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-400">{activeJobs.length}</p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Active</p>
                  </div>
                </div>
              </div>
              <div className="border rounded-xl p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-400">{completedJobs.length}</p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Completed</p>
                  </div>
                </div>
              </div>
              <div className="border rounded-xl p-4" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-400">{failedJobs.length}</p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Failed</p>
                  </div>
                </div>
              </div>
            </div>

            {jobs.length === 0 ? (
              <div className="border rounded-xl p-12 text-center" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
                  <Inbox className="w-7 h-7 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>No render jobs yet</h3>
                <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: "var(--text-secondary)" }}>
                  Start creating videos to see your render queue here.
                </p>
                <Link href="/projects/new">
                  <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white">
                    Create a Video
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Active Renders</h2>
                  {activeJobs.length === 0 ? (
                    <div className="border rounded-xl p-6 text-center" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>No active renders right now</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeJobs.map((job: any) => (
                        <Link key={job.jobId} href={`/projects/${job.projectId}`}>
                          <div className="border rounded-xl p-5 cursor-pointer hover:border-purple-500/30 transition-colors" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{job.projectTitle}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Scene {job.sceneId}</span>
                                  <span style={{ color: "var(--text-muted)" }}>·</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">{job.provider}</span>
                                  <span style={{ color: "var(--text-muted)" }}>·</span>
                                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>{formatRelativeTime(job.startedAt || job.createdAt)}</span>
                                </div>
                              </div>
                              <span className="text-lg font-bold text-purple-400 font-mono">{job.progress || 0}%</span>
                            </div>
                            <div className="w-full rounded-full h-2" style={{ backgroundColor: "var(--surface-hover)" }}>
                              <div
                                className="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all"
                                style={{ width: `${job.progress || 0}%` }}
                              />
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {completedJobs.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Completed</h2>
                    <div className="space-y-3">
                      {completedJobs.slice(0, 20).map((job: any) => (
                        <Link key={job.jobId} href={`/projects/${job.projectId}`}>
                          <div className="border rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-emerald-500/30 transition-colors" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                            <div className="flex items-center gap-4">
                              <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                              </div>
                              <div>
                                <p className="font-medium" style={{ color: "var(--text-primary)" }}>{job.projectTitle}</p>
                                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Scene {job.sceneId} · {job.provider}{job.duration ? ` · ${job.duration}s` : ""}</p>
                              </div>
                            </div>
                            <span className="text-sm" style={{ color: "var(--text-muted)" }}>{formatRelativeTime(job.completedAt || job.updatedAt)}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {failedJobs.length > 0 && (
                  <div>
                    <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-secondary)" }}>Failed</h2>
                    <div className="space-y-3">
                      {failedJobs.slice(0, 20).map((job: any) => (
                        <Link key={job.jobId} href={`/projects/${job.projectId}`}>
                          <div className="border rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-red-500/30 transition-colors" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
                            <div className="flex items-center gap-4">
                              <div className="w-9 h-9 rounded-full bg-red-500/10 flex items-center justify-center">
                                <XCircle className="w-5 h-5 text-red-400" />
                              </div>
                              <div>
                                <p className="font-medium" style={{ color: "var(--text-primary)" }}>{job.projectTitle}</p>
                                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Scene {job.sceneId} · {job.errorMessage || "Unknown error"} · {formatRelativeTime(job.updatedAt)}</p>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5" onClick={(e) => e.preventDefault()}>
                              <RotateCcw className="w-3.5 h-3.5" />
                              Retry
                            </Button>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
