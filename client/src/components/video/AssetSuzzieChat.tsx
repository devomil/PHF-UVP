import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiRequest } from '@/lib/queryClient';
import {
  MessageCircle,
  Send,
  Loader2,
  Sparkles,
  X,
  Check,
  ArrowRight,
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suggestedPrompt?: string;
  suggestedProvider?: string;
}

interface AssetSuzzieChatProps {
  mode: string;
  provider: string;
  prompt: string;
  hasReferenceImage: boolean;
  aspectRatio: string;
  duration: number;
  style: string;
  validProviderIds: string[];
  onApplyPrompt: (prompt: string) => void;
  onApplyProvider?: (provider: string) => void;
}

export function AssetSuzzieChat({
  mode,
  provider,
  prompt,
  hasReferenceImage,
  aspectRatio,
  duration,
  style,
  validProviderIds,
  onApplyPrompt,
  onApplyProvider,
}: AssetSuzzieChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [appliedPromptIndex, setAppliedPromptIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevModeRef = useRef(mode);

  useEffect(() => {
    if (prevModeRef.current !== mode) {
      setMessages([]);
      setInput('');
      setAppliedPromptIndex(null);
      prevModeRef.current = mode;
    }
  }, [mode]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));

      const res = await apiRequest('POST', '/api/universal-video/ask-suzzie/asset-library', {
        message: trimmed,
        conversationHistory: history,
        context: {
          mode,
          provider,
          prompt,
          hasReferenceImage,
          aspectRatio,
          duration,
          style,
        },
      });
      const data = await res.json();

      if (data.success) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.message,
          suggestedPrompt: data.suggestedPrompt,
          suggestedProvider: data.suggestedProvider,
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.error || 'Sorry, something went wrong. Please try again.',
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Connection error. Please try again.',
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, mode, provider, prompt, hasReferenceImage, aspectRatio, duration, style]);

  const handleApplyPrompt = (suggestedPrompt: string, index: number) => {
    onApplyPrompt(suggestedPrompt);
    setAppliedPromptIndex(index);
    setTimeout(() => setAppliedPromptIndex(null), 2000);
  };

  const handleApplyProvider = (suggestedProvider: string) => {
    if (validProviderIds.includes(suggestedProvider)) {
      onApplyProvider?.(suggestedProvider);
    }
  };

  const isValidProvider = (id: string | undefined): boolean => {
    return !!id && validProviderIds.includes(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const modeLabels: Record<string, string> = {
    't2i': 'image',
    't2v': 'video',
    'i2v': 'video from image',
    'character': 'character',
  };

  const quickStarters = [
    `Help me write a ${modeLabels[mode] || 'generation'} prompt`,
    'Improve my current prompt',
    'Which provider should I use?',
  ];

  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="h-7 px-2.5 text-xs border-purple-500/50 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 hover:border-purple-400 gap-1.5"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Ask Suzzie
      </Button>
    );
  }

  return (
    <div className="border border-purple-500/30 rounded-lg bg-gray-900/80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-purple-500/10 border-b border-purple-500/20">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-xs font-medium text-purple-300">Suzzie — Prompt Assistant</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="overflow-y-auto p-3 space-y-3"
        style={{ maxHeight: '240px', minHeight: '120px' }}
      >
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">
              I can help you craft the perfect prompt. Try one of these:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quickStarters.map((starter, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(starter); inputRef.current?.focus(); }}
                  className="text-[11px] px-2.5 py-1.5 rounded-full border border-gray-700 text-gray-400 hover:border-purple-500/50 hover:text-purple-300 transition-all"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] space-y-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`px-3 py-2 rounded-lg text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-purple-600/30 text-purple-100 rounded-br-sm'
                    : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>

              {msg.suggestedPrompt && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2.5 space-y-2">
                  <p className="text-[10px] text-green-400 font-medium uppercase tracking-wider">Suggested Prompt</p>
                  <p className="text-xs text-green-100 leading-relaxed">{msg.suggestedPrompt}</p>
                  <Button
                    size="sm"
                    onClick={() => handleApplyPrompt(msg.suggestedPrompt!, i)}
                    disabled={appliedPromptIndex === i}
                    className={`h-6 px-3 text-[11px] gap-1 ${
                      appliedPromptIndex === i
                        ? 'bg-green-700 text-green-200'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {appliedPromptIndex === i ? (
                      <>
                        <Check className="h-3 w-3" />
                        Applied
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-3 w-3" />
                        Apply Prompt
                      </>
                    )}
                  </Button>
                </div>
              )}

              {msg.suggestedProvider && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wider">Suggested Provider</p>
                    <p className="text-xs text-blue-200">{msg.suggestedProvider}</p>
                  </div>
                  {onApplyProvider && isValidProvider(msg.suggestedProvider) && (
                    <Button
                      size="sm"
                      onClick={() => handleApplyProvider(msg.suggestedProvider!)}
                      className="h-6 px-2.5 text-[11px] bg-blue-600 hover:bg-blue-700 text-white gap-1"
                    >
                      <ArrowRight className="h-3 w-3" />
                      Apply
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-lg px-3 py-2 rounded-bl-sm flex items-center gap-2">
              <Loader2 className="h-3 w-3 text-purple-400 animate-spin" />
              <span className="text-xs text-gray-400">Suzzie is thinking...</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-800 p-2 flex gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Suzzie for prompt help..."
          disabled={isLoading}
          className="flex-1 h-8 text-xs bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
        />
        <Button
          size="sm"
          onClick={sendMessage}
          disabled={!input.trim() || isLoading}
          className="h-8 w-8 p-0 bg-purple-600 hover:bg-purple-700"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
