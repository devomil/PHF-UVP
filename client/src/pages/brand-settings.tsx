import { useState, useEffect, useRef, useCallback } from "react";
import { Palette, Type, Droplets, Image, FileText, Save, Loader2, Check, Upload, Trash2, TrendingUp, Users, Building2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CanvaConnect } from "@/components/settings/CanvaConnect";

interface BrandSettingsData {
  brandName: string;
  tagline: string;
  website: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  guidelines: string;
  industry: string;
  contentNiche: string;
  targetAudience: string;
  trendAnalysisEnabled: boolean;
}

export default function BrandSettings() {
  const [settings, setSettings] = useState<BrandSettingsData>({
    brandName: "",
    tagline: "",
    website: "",
    primaryColor: "#9333ea",
    secondaryColor: "#4f46e5",
    accentColor: "#06b6d4",
    logoUrl: null,
    guidelines: "",
    industry: "",
    contentNiche: "",
    targetAudience: "",
    trendAnalysisEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/brand-settings", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/brand-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        toast({ title: "Brand settings saved", description: "Your brand identity has been updated." });
        setTimeout(() => setSaved(false), 3000);
      } else {
        toast({ title: "Save failed", description: data.error || "Could not save settings.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Save failed", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 5MB.", variant: "destructive" });
      return;
    }

    setUploadingLogo(true);
    const formData = new FormData();
    formData.append("logo", file);

    try {
      const res = await fetch("/api/brand-settings/logo", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.logoUrl) {
        setSettings((prev) => ({ ...prev, logoUrl: data.logoUrl }));
        toast({ title: "Logo uploaded", description: "Your brand logo has been saved." });
      } else {
        toast({ title: "Upload failed", description: data.error || "Could not upload logo.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Upload failed", description: "Network error.", variant: "destructive" });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleLogoDelete = async () => {
    try {
      const res = await fetch("/api/brand-settings/logo", {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setSettings((prev) => ({ ...prev, logoUrl: null }));
        toast({ title: "Logo removed" });
      }
    } catch {
      toast({ title: "Failed to remove logo", variant: "destructive" });
    }
  };

  const handleLogoDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      const dt = new DataTransfer();
      dt.items.add(file);
      if (logoInputRef.current) {
        logoInputRef.current.files = dt.files;
        logoInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
        handleLogoUpload({ target: { files: dt.files } } as any);
      }
    }
  }, []);

  const updateField = (field: keyof BrandSettingsData, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[400px]" style={{ color: "var(--text-primary)" }}>
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8" style={{ color: "var(--text-primary)" }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <Palette className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Brand Settings</h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Configure your brand identity for video productions
              </p>
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-2.5 rounded-lg font-medium shadow-lg transition-all ${
              saved
                ? "bg-green-600 hover:bg-green-500 shadow-green-500/20"
                : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-500/20"
            } text-white`}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Saved
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Type className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Brand Identity
              </h2>
            </div>
            <div
              className="border rounded-xl p-5 space-y-4"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            >
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Brand Name
                </label>
                <input
                  type="text"
                  value={settings.brandName}
                  onChange={(e) => updateField("brandName", e.target.value)}
                  placeholder="Your Brand Name"
                  className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Tagline
                </label>
                <input
                  type="text"
                  value={settings.tagline}
                  onChange={(e) => updateField("tagline", e.target.value)}
                  placeholder="Your brand tagline"
                  className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Website
                </label>
                <input
                  type="url"
                  value={settings.website}
                  onChange={(e) => updateField("website", e.target.value)}
                  placeholder="https://yourbrand.com"
                  className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Droplets className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Color Palette
              </h2>
            </div>
            <div
              className="border rounded-xl p-5"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            >
              <div className="grid grid-cols-3 gap-6">
                {[
                  { label: "Primary", field: "primaryColor" as const },
                  { label: "Secondary", field: "secondaryColor" as const },
                  { label: "Accent", field: "accentColor" as const },
                ].map(({ label, field }) => (
                  <div key={field} className="flex flex-col items-center gap-2">
                    <label
                      className="relative w-14 h-14 rounded-full border-2 border-white/10 shadow-lg cursor-pointer overflow-hidden"
                      style={{ backgroundColor: settings[field] }}
                    >
                      <input
                        type="color"
                        value={settings[field]}
                        onChange={(e) => updateField(field, e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </label>
                    <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                      {label}
                    </span>
                    <input
                      type="text"
                      value={settings[field]}
                      onChange={(e) => updateField(field, e.target.value)}
                      className="w-full border rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:border-purple-500/50 transition-colors"
                      style={{
                        backgroundColor: "var(--surface)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Image className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Logo Management
              </h2>
            </div>
            <div
              className="border rounded-xl p-5"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            >
              {settings.logoUrl ? (
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-xl border flex items-center justify-center overflow-hidden" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-hover)" }}>
                    <img
                      src={settings.logoUrl}
                      alt="Brand logo"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium mb-1">Logo uploaded</p>
                    <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                      Click replace to upload a new logo
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                        style={{ borderColor: "var(--border-medium)", color: "var(--text-secondary)" }}
                      >
                        {uploadingLogo ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                        Replace
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLogoDelete}
                        className="text-red-400 hover:text-red-300 hover:border-red-500/30"
                        style={{ borderColor: "var(--border-medium)" }}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="border border-dashed rounded-xl p-10 text-center hover:border-purple-500/30 transition-colors cursor-pointer"
                  style={{ borderColor: "var(--border-medium)" }}
                  onClick={() => logoInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleLogoDrop}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: "var(--surface-hover)" }}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                    ) : (
                      <Image className="w-6 h-6" style={{ color: "var(--text-secondary)" }} />
                    )}
                  </div>
                  <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
                    Drop your logo here or click to upload
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                    PNG, SVG, or JPG up to 5MB
                  </p>
                </div>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Brand Guidelines
              </h2>
            </div>
            <div
              className="border rounded-xl p-5"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            >
              <textarea
                value={settings.guidelines}
                onChange={(e) => updateField("guidelines", e.target.value)}
                placeholder="Describe your brand voice, style guidelines, dos and don'ts for video content..."
                rows={6}
                className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors resize-none"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                These guidelines will be used to inform AI-generated scripts, visual directions, and voiceover tone.
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Industry & Audience
              </h2>
            </div>
            <div
              className="border rounded-xl p-5 space-y-4"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border-subtle)" }}
            >
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Industry
                </label>
                <select
                  value={settings.industry}
                  onChange={(e) => updateField("industry", e.target.value)}
                  className="w-full border rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">Select your industry</option>
                  <option value="Health & Wellness">Health & Wellness</option>
                  <option value="Fitness">Fitness</option>
                  <option value="Food & Beverage">Food & Beverage</option>
                  <option value="Education">Education</option>
                  <option value="Beauty">Beauty</option>
                  <option value="E-commerce">E-commerce</option>
                  <option value="Home & Garden">Home & Garden</option>
                  <option value="Professional Services">Professional Services</option>
                  <option value="Technology">Technology</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="Finance">Finance</option>
                  <option value="Travel">Travel</option>
                  <option value="Real Estate">Real Estate</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Content Niche
                </label>
                <input
                  type="text"
                  value={settings.contentNiche}
                  onChange={(e) => updateField("contentNiche", e.target.value)}
                  placeholder="e.g., gut health supplements, keto recipes, morning routines"
                  className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />
                <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                  Comma-separated topics that define your content focus
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Target Audience
                </label>
                <textarea
                  value={settings.targetAudience}
                  onChange={(e) => updateField("targetAudience", e.target.value)}
                  placeholder="e.g., women 25-45 interested in natural wellness, busy professionals looking for quick health tips"
                  rows={3}
                  className="w-full border rounded-lg px-3.5 py-2.5 placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-colors resize-none"
                  style={{
                    backgroundColor: "var(--surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
              <div
                className="flex items-center justify-between p-4 rounded-lg border"
                style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-hover)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">AI Trend Intelligence</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Analyze Google Trends, YouTube & social media for viral hook suggestions
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.trendAnalysisEnabled}
                  onClick={() => {
                    setSettings((prev) => ({ ...prev, trendAnalysisEnabled: !prev.trendAnalysisEnabled }));
                    setSaved(false);
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${
                    settings.trendAnalysisEnabled ? "bg-purple-600" : "bg-gray-600"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.trendAnalysisEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
              <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Integrations
              </h2>
            </div>
            <CanvaConnect />
          </div>
        </div>
      </div>
    </div>
  );
}
