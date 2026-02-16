import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const recentProjects = [
  { id: 1, name: "Product Launch Video", type: "product", status: "completed", date: "2026-02-15" },
  { id: 2, name: "Brand Story Series", type: "script-based", status: "rendering", date: "2026-02-14" },
  { id: 3, name: "Social Media Ads Pack", type: "product", status: "draft", date: "2026-02-13" },
  { id: 4, name: "Tutorial Walkthrough", type: "script-based", status: "completed", date: "2026-02-12" },
];

const statusColors: Record<string, string> = {
  draft: "bg-gray-700 text-gray-300",
  rendering: "bg-yellow-900 text-yellow-300",
  completed: "bg-green-900 text-green-300",
  failed: "bg-red-900 text-red-300",
};

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-400 mt-1">Welcome to your AI Video Production Studio</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400">Total Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-white">24</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400">Rendering</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-yellow-400">3</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-400">18</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-3 mb-8">
          <Link href="/projects">
            <Button className="bg-purple-600 hover:bg-purple-700">New Project</Button>
          </Link>
          <Link href="/assets">
            <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">Asset Library</Button>
          </Link>
          <Link href="/brand">
            <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">Brand Settings</Button>
          </Link>
        </div>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Recent Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentProjects.map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 hover:bg-gray-750 cursor-pointer transition-colors">
                    <div>
                      <p className="font-medium text-white">{project.name}</p>
                      <p className="text-sm text-gray-400">{project.type} · {project.date}</p>
                    </div>
                    <Badge className={statusColors[project.status]}>{project.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex gap-3 text-sm text-gray-500">
          <Link href="/render-queue" className="hover:text-gray-300">Render Queue</Link>
          <span>·</span>
          <Link href="/providers" className="hover:text-gray-300">AI Providers</Link>
          <span>·</span>
          <Link href="/profile" className="hover:text-gray-300">Profile</Link>
        </div>
      </div>
    </div>
  );
}
