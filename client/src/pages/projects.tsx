import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const allProjects = [
  { id: 1, name: "Product Launch Video", type: "product", status: "completed", date: "2026-02-15" },
  { id: 2, name: "Brand Story Series", type: "script-based", status: "rendering", date: "2026-02-14" },
  { id: 3, name: "Social Media Ads Pack", type: "product", status: "draft", date: "2026-02-13" },
  { id: 4, name: "Tutorial Walkthrough", type: "script-based", status: "completed", date: "2026-02-12" },
  { id: 5, name: "Q1 Promo Campaign", type: "product", status: "failed", date: "2026-02-10" },
  { id: 6, name: "Onboarding Video", type: "script-based", status: "draft", date: "2026-02-09" },
];

const statusColors: Record<string, string> = {
  draft: "bg-gray-700 text-gray-300",
  rendering: "bg-yellow-900 text-yellow-300",
  completed: "bg-green-900 text-green-300",
  failed: "bg-red-900 text-red-300",
};

const filters = ["all", "draft", "rendering", "completed", "failed"];

export default function Projects() {
  const [activeFilter, setActiveFilter] = useState("all");

  const filtered = activeFilter === "all"
    ? allProjects
    : allProjects.filter((p) => p.status === activeFilter);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-gray-400 mt-1">Manage your video productions</p>
          </div>
          <Link href="/projects/new">
            <Button className="bg-purple-600 hover:bg-purple-700">New Project</Button>
          </Link>
        </div>

        <div className="flex gap-2 mb-6">
          {filters.map((f) => (
            <Button
              key={f}
              variant={activeFilter === f ? "default" : "outline"}
              size="sm"
              className={activeFilter === f
                ? "bg-purple-600 hover:bg-purple-700"
                : "border-gray-700 text-gray-400 hover:bg-gray-800"}
              onClick={() => setActiveFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">All Projects ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-sm text-gray-400">
                    <th className="pb-3 pr-4">Name</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((project) => (
                    <tr key={project.id} className="border-b border-gray-800 last:border-0">
                      <td className="py-3 pr-4">
                        <Link href={`/projects/${project.id}`} className="text-purple-400 hover:text-purple-300 font-medium">
                          {project.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-gray-400">{project.type}</td>
                      <td className="py-3 pr-4">
                        <Badge className={statusColors[project.status]}>{project.status}</Badge>
                      </td>
                      <td className="py-3 text-gray-400">{project.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300">← Back to Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
