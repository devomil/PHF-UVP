import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const activeRenders = [
  { id: 1, project: "Brand Story Series", scene: "Scene 3", progress: 65, provider: "Kling", startedAt: "2 min ago" },
  { id: 2, project: "Social Media Ads", scene: "Scene 1", progress: 30, provider: "RunwayML", startedAt: "5 min ago" },
];

const completedRenders = [
  { id: 3, project: "Product Launch Video", scene: "All Scenes", duration: "35s", completedAt: "10 min ago" },
  { id: 4, project: "Tutorial Walkthrough", scene: "All Scenes", duration: "120s", completedAt: "1 hour ago" },
];

const failedRenders = [
  { id: 5, project: "Q1 Promo Campaign", scene: "Scene 2", error: "Provider timeout", failedAt: "30 min ago" },
];

export default function RenderQueue() {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Render Queue</h1>
          <p className="text-gray-400 mt-1">Monitor your video rendering jobs</p>
        </div>

        <Card className="bg-gray-900 border-gray-800 mb-6">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              Active Renders
              <Badge className="bg-yellow-900 text-yellow-300">{activeRenders.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeRenders.length === 0 ? (
              <p className="text-gray-500">No active renders</p>
            ) : (
              <div className="space-y-4">
                {activeRenders.map((render) => (
                  <div key={render.id} className="p-4 bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium text-white">{render.project}</p>
                        <p className="text-sm text-gray-400">{render.scene} · {render.provider} · Started {render.startedAt}</p>
                      </div>
                      <span className="text-sm text-yellow-400 font-mono">{render.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full transition-all"
                        style={{ width: `${render.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800 mb-6">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              Completed
              <Badge className="bg-green-900 text-green-300">{completedRenders.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {completedRenders.map((render) => (
                <div key={render.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div>
                    <p className="font-medium text-white">{render.project}</p>
                    <p className="text-sm text-gray-400">{render.scene} · {render.duration} · {render.completedAt}</p>
                  </div>
                  <Badge className="bg-green-900 text-green-300">Done</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              Failed
              <Badge className="bg-red-900 text-red-300">{failedRenders.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {failedRenders.map((render) => (
                <div key={render.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div>
                    <p className="font-medium text-white">{render.project}</p>
                    <p className="text-sm text-gray-400">{render.scene} · {render.error} · {render.failedAt}</p>
                  </div>
                  <Button size="sm" className="bg-red-900 hover:bg-red-800 text-red-300">Retry</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300">← Back to Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
