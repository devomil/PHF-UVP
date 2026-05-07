// Phase NC-03 — Contact-sales page.
// Themed inline success state, accessible labels, honeypot anti-spam,
// `mailto:` fallback when /api/sales-inquiries is unconfigured.

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import neuralcutFullLogo from "@/assets/neuralcut-full-logo.png";

export default function ContactSalesPage() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [config, setConfig] = useState<{ configured: boolean; fallbackEmail: string | null } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", company: "", estMonthlyGC: "", message: "", website: "" });

  useEffect(() => {
    document.title = "Talk to sales — NeuralCut.AI";
    fetch("/api/sales-inquiries/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({ configured: false, fallbackEmail: null }));
    const params = new URLSearchParams(window.location.search);
    const plan = params.get("plan");
    const topup = params.get("topup");
    if (plan) setForm((f) => ({ ...f, message: `I'm interested in the ${plan} plan.\n\n` }));
    else if (topup) setForm((f) => ({ ...f, message: `I'm interested in the ${topup} top-up pack.\n\n` }));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/sales-inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ title: "Couldn't send", description: data.error || "Try again or email us directly.", variant: "destructive" });
        return;
      }
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "Network error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: "var(--surface-base, #09090f)" }}>
      <header className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src={neuralcutFullLogo} alt="NeuralCut.AI" className="h-24 object-contain" />
          </Link>
          <Link href="/pricing" className="text-sm text-purple-300 hover:text-purple-200 flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to pricing
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16" data-testid="contact-sales-page">
        <h1 className="text-3xl md:text-4xl font-bold mb-3 bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
          Talk to sales
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-secondary, #94a3b8)" }}>
          Tell us about your project and we'll get back to you within one business day.
        </p>

        {submitted ? (
          <div
            className="p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-center"
            data-testid="contact-sales-success"
          >
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <h2 className="text-xl font-semibold mb-2">Thanks — we got it.</h2>
            <p className="text-sm" style={{ color: "var(--text-secondary, #94a3b8)" }}>
              We'll be in touch shortly at <span className="text-white">{form.email}</span>.
            </p>
            <div className="mt-4 flex gap-2 justify-center">
              <Link href="/pricing">
                <Button variant="outline" size="sm">Back to pricing</Button>
              </Link>
              <Link href="/auth">
                <Button size="sm" className="bg-gradient-to-r from-purple-600 to-indigo-600">Start free trial</Button>
              </Link>
            </div>
          </div>
        ) : config && !config.configured ? (
          <div
            className="p-6 rounded-xl border border-amber-500/30 bg-amber-500/5"
            data-testid="contact-sales-mailto-fallback"
          >
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
              Our online form is temporarily unavailable. Please email us directly and we'll reply within a business day.
            </p>
            {config.fallbackEmail ? (
              <a
                href={`mailto:${config.fallbackEmail}?subject=NeuralCut.AI%20sales%20inquiry`}
                className="inline-block"
              >
                <Button className="bg-gradient-to-r from-purple-600 to-indigo-600">
                  Email {config.fallbackEmail}
                </Button>
              </a>
            ) : (
              <p className="text-sm text-amber-200">
                Please reach out via your usual NeuralCut.AI contact and we'll route your inquiry to the sales team.
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="contact-sales-form" noValidate>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Name" id="cs-name" required>
                <Input id="cs-name" required value={form.name} onChange={update("name")} maxLength={200} data-testid="cs-input-name" />
              </Field>
              <Field label="Work email" id="cs-email" required>
                <Input id="cs-email" required type="email" value={form.email} onChange={update("email")} maxLength={320} data-testid="cs-input-email" />
              </Field>
              <Field label="Company" id="cs-company" required>
                <Input id="cs-company" required value={form.company} onChange={update("company")} maxLength={200} data-testid="cs-input-company" />
              </Field>
              <Field label="Est. monthly GC" id="cs-gc" hint="Optional rough estimate">
                <Input
                  id="cs-gc"
                  inputMode="numeric"
                  value={form.estMonthlyGC}
                  onChange={update("estMonthlyGC")}
                  placeholder="e.g. 5000"
                  data-testid="cs-input-gc"
                />
              </Field>
            </div>
            <Field label="What are you trying to build?" id="cs-message" required>
              <Textarea
                id="cs-message"
                required
                rows={5}
                value={form.message}
                onChange={update("message")}
                maxLength={5000}
                data-testid="cs-input-message"
              />
            </Field>

            {/* Honeypot — visually hidden, not aria-hidden so the label exists for parity. */}
            <div className="absolute left-[-9999px] top-[-9999px]" aria-hidden="true">
              <label htmlFor="cs-website">Website (leave blank)</label>
              <input
                id="cs-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={update("website")}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/pricing">
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-gradient-to-r from-purple-600 to-indigo-600"
                data-testid="cs-submit"
              >
                {submitting ? "Sending…" : "Send inquiry"}
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  id,
  required,
  hint,
  children,
}: {
  label: string;
  id: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-sm">
        {label} {required && <span className="text-rose-400">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[11px] mt-1" style={{ color: "var(--text-muted, #64748b)" }}>{hint}</p>}
    </div>
  );
}
