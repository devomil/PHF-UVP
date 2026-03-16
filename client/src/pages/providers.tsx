import { useState } from "react";
import { Cpu, Info, FlaskConical, LayoutGrid } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderRegistryPanel } from "@/components/video/provider-registry-panel";
import ProviderTestingPlayground from "@/components/video/provider-testing-playground";

export default function Providers() {
  const [activeTab, setActiveTab] = useState("registry");

  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Cpu className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Providers</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Manage video & image generation providers, test capabilities, and monitor usage
            </p>
          </div>
        </div>

        <div className="border rounded-xl p-4 mb-6 flex items-start gap-3" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
          <Info className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            All providers are accessed through PiAPI. Set your <code className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ backgroundColor: "var(--surface-hover)" }}>PIAPI_API_KEY</code> environment variable to enable video and image generation.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}>
            <TabsTrigger value="registry" className="gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
              <LayoutGrid className="w-4 h-4" />
              Provider Registry
            </TabsTrigger>
            <TabsTrigger value="playground" className="gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400">
              <FlaskConical className="w-4 h-4" />
              Testing Playground
            </TabsTrigger>
          </TabsList>

          <TabsContent value="registry">
            <ProviderRegistryPanel />
          </TabsContent>

          <TabsContent value="playground">
            <ProviderTestingPlayground />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
