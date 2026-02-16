import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BrandSettings() {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Brand Settings</h1>
          <p className="text-gray-400 mt-1">Configure your brand identity for video productions</p>
        </div>

        <div className="space-y-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Brand Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Brand Name</label>
                <input
                  type="text"
                  placeholder="Your Brand Name"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Tagline</label>
                <input
                  type="text"
                  placeholder="Your brand tagline"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Website</label>
                <input
                  type="url"
                  placeholder="https://yourbrand.com"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Color Palette</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Primary</label>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-purple-600 border border-gray-700"></div>
                    <input
                      type="text"
                      defaultValue="#9333ea"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Secondary</label>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-indigo-600 border border-gray-700"></div>
                    <input
                      type="text"
                      defaultValue="#4f46e5"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Accent</label>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-cyan-500 border border-gray-700"></div>
                    <input
                      type="text"
                      defaultValue="#06b6d4"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Logo Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center">
                <p className="text-gray-400">Drop your logo here or click to upload</p>
                <p className="text-sm text-gray-600 mt-1">PNG, SVG, or JPG up to 5MB</p>
                <Button variant="outline" className="mt-4 border-gray-700 text-gray-300 hover:bg-gray-800">
                  Choose File
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Brand Guidelines</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                placeholder="Describe your brand voice, style guidelines, dos and don'ts for video content..."
                rows={6}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
              />
            </CardContent>
          </Card>

          <div className="flex justify-between items-center">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300">← Back to Dashboard</Link>
            <Button className="bg-purple-600 hover:bg-purple-700">Save Settings</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
