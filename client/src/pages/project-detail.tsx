import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const scenes = [
  { id: 1, name: "Opening Hook", duration: "5s", status: "completed" },
  { id: 2, name: "Problem Statement", duration: "8s", status: "completed" },
  { id: 3, name: "Solution Demo", duration: "12s", status: "rendering" },
  { id: 4, name: "Social Proof", duration: "6s", status: "pending" },
  { id: 5, name: "Call to Action", duration: "4s", status: "pending" },
];

const statusColors: Record<string, string> = {
  pending: "bg-gray-700 text-gray-300",
  rendering: "bg-yellow-900 text-yellow-300",
  completed: "bg-green-900 text-green-300",
  failed: "bg-red-900 text-red-300",
};

export default function ProjectDetail({ params }: { params?: { id: string } }) {
  const projectId = params?.id || "1";

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4">
          <Link href="/projects" className="text-sm text-gray-500 hover:text-gray-300">← Back to Projects</Link>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Product Launch Video</h1>
            <p className="text-gray-400 mt-1">Project #{projectId} · product · Created Feb 15, 2026</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">Edit Settings</Button>
            <Button className="bg-purple-600 hover:bg-purple-700">Generate All</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <p className="text-sm text-gray-400">Status</p>
              <Badge className="bg-yellow-900 text-yellow-300 mt-1">Rendering</Badge>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <p className="text-sm text-gray-400">Duration</p>
              <p className="text-xl font-bold text-white">35s</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <p className="text-sm text-gray-400">Quality Score</p>
              <p className="text-xl font-bold text-green-400">87/100</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <p className="text-sm text-gray-400">Platform</p>
              <p className="text-xl font-bold text-white">YouTube</p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-gray-900 border-gray-800 mb-6">
          <CardHeader>
            <CardTitle className="text-white">Scenes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scenes.map((scene) => (
                <div key={scene.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800">
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-12 bg-gray-700 rounded flex items-center justify-center text-xs text-gray-500">
                      Scene {scene.id}
                    </div>
                    <div>
                      <p className="font-medium text-white">{scene.name}</p>
                      <p className="text-sm text-gray-400">{scene.duration}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[scene.status]}>{scene.status}</Badge>
                    <Button size="sm" variant="outline" className="border-gray-700 text-gray-400 hover:bg-gray-700">
                      Regenerate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Quality Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-gray-400 text-sm">
              <p>Quality evaluation will appear here after all scenes are generated.</p>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-gray-800 rounded-lg">
                  <p className="text-xs text-gray-500">Visual Quality</p>
                  <p className="text-lg font-bold text-white">--</p>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg">
                  <p className="text-xs text-gray-500">Brand Consistency</p>
                  <p className="text-lg font-bold text-white">--</p>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg">
                  <p className="text-xs text-gray-500">Scene Transitions</p>
                  <p className="text-lg font-bold text-white">--</p>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg">
                  <p className="text-xs text-gray-500">Overall Score</p>
                  <p className="text-lg font-bold text-white">--</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
