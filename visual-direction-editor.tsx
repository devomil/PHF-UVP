import { useState, useEffect } from 'react';
import { Pencil, Wand2, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface VisualDirectionEditorProps {
  sceneId: string;
  currentDirection: string;
  narration: string;
  sceneType: string;
  onSave: (direction: string) => Promise<void>;
  disabled?: boolean;
}

export function VisualDirectionEditor({
  sceneId,
  currentDirection,
  narration,
  sceneType,
  onSave,
  disabled = false,
}: VisualDirectionEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [direction, setDirection] = useState(currentDirection);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setDirection(currentDirection);
  }, [currentDirection]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(direction);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save visual direction:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDirection(currentDirection);
    setIsEditing(false);
  };

  const handleGenerateSuggestion = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/universal-video/ai/suggest-visual-direction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          narration,
          sceneType,
          currentDirection,
        }),
      });
      
      if (response.ok) {
        const { suggestion } = await response.json();
        setDirection(suggestion);
      }
    } catch (error) {
      console.error('Failed to generate suggestion:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isEditing) {
    return (
      <TooltipProvider>
        <div className="group relative" data-testid="visual-direction-display">
          <p className="text-xs text-gray-500 pr-8 line-clamp-2">
            {currentDirection || 'No visual direction set'}
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-0 right-0 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setIsEditing(true)}
                disabled={disabled}
                data-testid="button-edit-visual-direction"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit visual direction</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-2" data-testid="visual-direction-editor">
      <Textarea
        value={direction}
        onChange={(e) => setDirection(e.target.value)}
        placeholder="Describe the visual style, camera angles, lighting, etc."
        className="text-xs min-h-[60px] resize-none"
        disabled={isSaving || isGenerating}
        data-testid="textarea-visual-direction"
      />
      
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7"
          onClick={handleGenerateSuggestion}
          disabled={isSaving || isGenerating}
          data-testid="button-ai-suggest"
        >
          {isGenerating ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Wand2 className="h-3 w-3 mr-1" />
          )}
          AI Suggest
        </Button>
        
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleCancel}
            disabled={isSaving}
            data-testid="button-cancel-edit"
          >
            <X className="h-3 w-3" />
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleSave}
            disabled={isSaving}
            data-testid="button-save-direction"
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default VisualDirectionEditor;
