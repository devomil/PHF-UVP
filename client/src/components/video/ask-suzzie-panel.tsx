import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, Send, Loader2, Wand2, Zap, HelpCircle, ChevronRight, Paperclip, ImageIcon } from "lucide-react";

interface SuzzieSceneContext {
  narration?: string;
  sceneType?: string;
  artPresetId?: string;
  artPresetName?: string;
  visualDirection?: string;
  provider?: string;
  projectTitle?: string;
  hasReferenceImage?: boolean;
}

interface ImageAttachment {
  base64: string;
  mediaType: string;
  previewUrl: string;
  fileName: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  suggestedPrompt?: string;
  suggestedProvider?: string;
  imagePreviewUrl?: string;
}

interface AskSuzziePanelProps {
  sceneContext: SuzzieSceneContext;
  onApplyVisualDirection?: (prompt: string) => void;
  onApplyProvider?: (providerId: string) => void;
  zIndex?: number;
}

const QUICK_ACTIONS = [
  { label: "Write visual direction", icon: Wand2, prompt: "Write me a visual direction/prompt for this scene based on the narration and art style." },
  { label: "Best provider?", icon: Zap, prompt: "Which AI video provider would you recommend for this scene and why?" },
  { label: "How to add a logo?", icon: HelpCircle, prompt: "How do I add a logo or watermark to this scene?" },
];

export function AskSuzziePanel({ sceneContext, onApplyVisualDirection, onApplyProvider, zIndex }: AskSuzziePanelProps) {
  const zStyle = zIndex ? { zIndex } : {};
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachment, setAttachment] = useState<ImageAttachment | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setMessages(prev => [...prev, { role: "assistant", content: "Please attach a JPEG, PNG, or WebP image." }]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessages(prev => [...prev, { role: "assistant", content: "That image is too large. Please use an image under 10MB." }]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      const mediaType = file.type;
      setAttachment({ base64, mediaType, previewUrl: dataUrl, fileName: file.name });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const removeAttachment = useCallback(() => setAttachment(null), []);

  const sendMessage = useCallback(async (text: string) => {
    if ((!text.trim() && !attachment) || isLoading) return;

    const currentAttachment = attachment;
    const userMessage: ChatMessage = {
      role: "user",
      content: text.trim() || (currentAttachment ? "What do you see in this image? Describe the environment and suggest a visual direction prompt." : ""),
      imagePreviewUrl: currentAttachment?.previewUrl,
    };
    setInput("");
    setAttachment(null);
    setIsLoading(true);

    let updatedMessages: ChatMessage[] = [];
    setMessages(prev => {
      updatedMessages = [...prev, userMessage];
      return updatedMessages;
    });

    await new Promise(r => setTimeout(r, 0));

    const conversationHistory = updatedMessages.map(m => ({
      role: m.role,
      content: m.suggestedPrompt
        ? `${m.content}\n\n[Suggested Prompt: ${m.suggestedPrompt}]`
        : m.content,
    }));

    try {
      const response = await fetch("/api/universal-video/ask-suzzie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: "assistant",
          question: userMessage.content,
          conversationHistory,
          narration: sceneContext.narration,
          sceneType: sceneContext.sceneType,
          artPresetId: sceneContext.artPresetId,
          artPresetName: sceneContext.artPresetName,
          visualDirection: sceneContext.visualDirection,
          provider: sceneContext.provider,
          projectTitle: sceneContext.projectTitle,
          hasReferenceImage: sceneContext.hasReferenceImage,
          ...(currentAttachment ? {
            imageAttachment: {
              base64: currentAttachment.base64,
              mediaType: currentAttachment.mediaType,
            },
          } : {}),
        }),
      });

      const data = await response.json();
      if (data.success) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.message,
          suggestedPrompt: data.suggestedPrompt,
          suggestedProvider: data.suggestedProvider,
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: `Sorry, I ran into an issue: ${data.error || "Unknown error"}` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't connect to the server. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, sceneContext, attachment]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl"
        style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.9), rgba(168,85,247,0.9))",
          color: "white",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(167,139,250,0.3)",
          ...zStyle,
        }}
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-sm font-medium">Ask Suzzie</span>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
      onClick={stopProp}
      onMouseDown={stopProp}
      style={{
        width: "460px",
        height: "600px",
        background: "rgba(15,10,30,0.92)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(124,58,237,0.25)",
        ...zStyle,
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(168,85,247,0.15))",
          borderBottom: "1px solid rgba(124,58,237,0.2)",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}>
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Ask Suzzie</h3>
            <p className="text-[10px]" style={{ color: "rgba(167,139,250,0.8)" }}>AI Creative Assistant</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
        >
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(124,58,237,0.3) transparent" }}>
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-center" style={{ color: "rgba(167,139,250,0.7)" }}>
              Hi! I'm Suzzie, your AI creative assistant. Ask me anything about your video project.
            </p>
            <div className="space-y-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => sendMessage(action.prompt)}
                  disabled={isLoading}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150 hover:scale-[1.01] disabled:opacity-50"
                  style={{
                    background: "rgba(124,58,237,0.08)",
                    border: "1px solid rgba(124,58,237,0.15)",
                    color: "rgba(167,139,250,0.9)",
                  }}
                >
                  <action.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-medium">{action.label}</span>
                  <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-xl px-3 py-2.5 text-xs leading-relaxed"
              style={
                msg.role === "user"
                  ? {
                      background: "rgba(124,58,237,0.25)",
                      color: "rgba(255,255,255,0.9)",
                      borderBottomRightRadius: "4px",
                    }
                  : {
                      background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.85)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderBottomLeftRadius: "4px",
                    }
              }
            >
              {msg.imagePreviewUrl && (
                <div className="mb-2 rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                  <img src={msg.imagePreviewUrl} alt="Attached" className="w-full max-h-[140px] object-cover" />
                </div>
              )}
              <div className="whitespace-pre-wrap text-[13px]">{msg.content}</div>

              {msg.suggestedPrompt && (
                <div
                  className="mt-2.5 rounded-lg overflow-hidden"
                  style={{
                    background: "rgba(124,58,237,0.08)",
                    border: "1px solid rgba(124,58,237,0.2)",
                  }}
                >
                  <div className="px-2.5 py-1.5 flex items-center gap-1.5" style={{ borderBottom: "1px solid rgba(124,58,237,0.15)" }}>
                    <Wand2 className="w-3 h-3" style={{ color: "rgba(167,139,250,0.8)" }} />
                    <span className="text-[10px] font-semibold" style={{ color: "rgba(167,139,250,0.9)" }}>Suggested Prompt</span>
                  </div>
                  <div
                    className="px-2.5 py-2 text-[11px] leading-relaxed max-h-[160px] overflow-y-auto"
                    style={{ color: "rgba(255,255,255,0.75)", scrollbarWidth: "thin", scrollbarColor: "rgba(124,58,237,0.3) transparent" }}
                  >
                    {msg.suggestedPrompt}
                  </div>
                  {onApplyVisualDirection && (
                    <div className="px-2.5 py-1.5" style={{ borderTop: "1px solid rgba(124,58,237,0.15)" }}>
                      <button
                        onClick={() => onApplyVisualDirection(msg.suggestedPrompt!)}
                        className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:scale-[1.01]"
                        style={{
                          background: "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(168,85,247,0.3))",
                          color: "white",
                          border: "1px solid rgba(167,139,250,0.3)",
                        }}
                      >
                        <Wand2 className="w-3 h-3" />
                        Apply to Visual Direction
                      </button>
                    </div>
                  )}
                </div>
              )}

              {msg.suggestedProvider && onApplyProvider && (
                <button
                  onClick={() => onApplyProvider(msg.suggestedProvider!)}
                  className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:scale-[1.02]"
                  style={{
                    background: "linear-gradient(135deg, rgba(34,197,94,0.3), rgba(16,185,129,0.2))",
                    color: "rgba(167,243,208,0.9)",
                    border: "1px solid rgba(34,197,94,0.25)",
                  }}
                >
                  <Zap className="w-3 h-3" />
                  Apply Provider
                </button>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div
              className="rounded-xl px-3 py-2.5 flex items-center gap-2"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <Loader2 className="w-3 h-3 animate-spin" style={{ color: "rgba(167,139,250,0.8)" }} />
              <span className="text-xs" style={{ color: "rgba(167,139,250,0.7)" }}>Suzzie is thinking...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div
        className="px-3 py-3 shrink-0"
        style={{ borderTop: "1px solid rgba(124,58,237,0.15)", background: "rgba(10,5,25,0.5)" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
        />
        {attachment && (
          <div className="mb-2 flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)" }}>
            <img src={attachment.previewUrl} alt="Attachment" className="w-10 h-10 rounded object-cover" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-white/70 truncate">{attachment.fileName}</div>
              <div className="text-[9px] text-white/40 flex items-center gap-1">
                <ImageIcon className="w-2.5 h-2.5" />
                Image attached
              </div>
            </div>
            <button onClick={removeAttachment} className="p-1 rounded hover:bg-white/10 transition-colors">
              <X className="w-3 h-3 text-white/50" />
            </button>
          </div>
        )}
        <div
          className="flex items-end gap-1.5 rounded-xl px-3 py-2"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(124,58,237,0.2)",
          }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="p-1.5 rounded-lg transition-all disabled:opacity-30 hover:bg-purple-600/30 shrink-0 mb-0.5"
            title="Attach an image"
          >
            <Paperclip className="w-3.5 h-3.5" style={{ color: attachment ? "rgb(167,139,250)" : "rgba(167,139,250,0.5)" }} />
          </button>
          <textarea
            ref={inputRef as any}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={attachment ? "Describe what you'd like Suzzie to do with this image..." : "Ask Suzzie anything..."}
            disabled={isLoading}
            rows={2}
            className="flex-1 bg-transparent text-xs text-white placeholder-white/30 outline-none disabled:opacity-50 resize-none"
            style={{ maxHeight: "80px", scrollbarWidth: "thin", scrollbarColor: "rgba(124,58,237,0.3) transparent" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={(!input.trim() && !attachment) || isLoading}
            className="p-1.5 rounded-lg transition-all disabled:opacity-30 hover:bg-purple-600/30 shrink-0 mb-0.5"
          >
            <Send className="w-3.5 h-3.5" style={{ color: "rgba(167,139,250,0.8)" }} />
          </button>
        </div>
      </div>
    </div>
  );
}
