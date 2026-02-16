import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const providers = [
  {
    name: "Kling",
    status: "connected",
    description: "High-quality AI video generation with advanced motion control",
    capabilities: ["Text-to-Video", "Image-to-Video", "Motion Control"],
  },
  {
    name: "RunwayML",
    status: "connected",
    description: "Professional-grade generative AI for creative video production",
    capabilities: ["Text-to-Video", "Image-to-Video", "Video Editing"],
  },
  {
    name: "Luma",
    status: "disconnected",
    description: "Dream Machine for cinematic AI video generation",
    capabilities: ["Text-to-Video", "Camera Control", "3D Scenes"],
  },
  {
    name: "Pika",
    status: "disconnected",
    description: "Creative AI video platform for quick content generation",
    capabilities: ["Text-to-Video", "Image-to-Video", "Style Transfer"],
  },
  {
    name: "Veo",
    status: "disconnected",
    description: "Google's advanced video generation model with high fidelity",
    capabilities: ["Text-to-Video", "High Resolution", "Long Duration"],
  },
];

export default function Providers() {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">AI Providers</h1>
          <p className="text-gray-400 mt-1">Manage your video generation provider connections</p>
        </div>

        <Card className="bg-gray-900 border-gray-800 mb-6">
          <CardContent className="py-4">
            <p className="text-sm text-gray-400">
              API keys are managed securely through environment variables. Contact your administrator to configure provider credentials.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {providers.map((provider) => (
            <Card key={provider.name} className="bg-gray-900 border-gray-800">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{provider.name}</h3>
                      <Badge className={provider.status === "connected"
                        ? "bg-green-900 text-green-300"
                        : "bg-gray-700 text-gray-400"}>
                        {provider.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-400 mb-3">{provider.description}</p>
                    <div className="flex gap-2 flex-wrap">
                      {provider.capabilities.map((cap) => (
                        <span key={cap} className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded">
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={`w-3 h-3 rounded-full mt-1 ${provider.status === "connected" ? "bg-green-500" : "bg-gray-600"}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300">← Back to Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
