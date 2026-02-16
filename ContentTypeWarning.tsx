import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Edit2, Check } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Scene {
  id: string;
  order: number;
  type?: string;
  visualDirection?: string;
  contentType?: string;
  contentTypeSource?: string;
  detectedContentType?: string;
  contentTypeConfidence?: number;
}

interface ContentTypeWarningProps {
  scenes: Scene[];
  onContentTypeChange: (sceneId: string, contentType: string) => void;
  onBatchContentTypeChange?: (updates: { sceneId: string; contentType: string }[]) => void;
  isPending?: boolean;
}

const CONTENT_TYPES = [
  { value: 'b-roll', label: 'B-Roll', description: 'Background/ambient footage' },
  { value: 'product-shot', label: 'Product Shot', description: 'Focus on product display' },
  { value: 'lifestyle', label: 'Lifestyle', description: 'People using product naturally' },
  { value: 'talking-head', label: 'Talking Head', description: 'Person speaking to camera' },
  { value: 'testimonial', label: 'Testimonial', description: 'Customer review/story' },
  { value: 'demo', label: 'Demo/Tutorial', description: 'How-to or demonstration' },
  { value: 'cinematic', label: 'Cinematic', description: 'Dramatic/artistic shots' },
  { value: 'text-overlay', label: 'Text/Graphics', description: 'Motion graphics or text focus' },
];

function detectContentType(scene: Scene): { type: string; confidence: number } {
  const visualDirection = (scene.visualDirection || '').toLowerCase();
  const sceneType = (scene.type || '').toLowerCase();
  
  if (visualDirection.includes('product') || visualDirection.includes('bottle') || 
      visualDirection.includes('package') || visualDirection.includes('display')) {
    return { type: 'product-shot', confidence: 0.85 };
  }
  
  if (visualDirection.includes('person') || visualDirection.includes('customer') || 
      visualDirection.includes('woman') || visualDirection.includes('man') ||
      visualDirection.includes('lifestyle') || visualDirection.includes('using')) {
    return { type: 'lifestyle', confidence: 0.75 };
  }
  
  if (visualDirection.includes('testimonial') || visualDirection.includes('review') ||
      visualDirection.includes('interview')) {
    return { type: 'testimonial', confidence: 0.8 };
  }
  
  if (visualDirection.includes('demo') || visualDirection.includes('tutorial') ||
      visualDirection.includes('how to') || visualDirection.includes('step')) {
    return { type: 'demo', confidence: 0.8 };
  }
  
  if (visualDirection.includes('text') || visualDirection.includes('graphic') ||
      visualDirection.includes('title') || visualDirection.includes('logo')) {
    return { type: 'text-overlay', confidence: 0.85 };
  }
  
  if (visualDirection.includes('cinematic') || visualDirection.includes('dramatic') ||
      visualDirection.includes('slow motion') || visualDirection.includes('aerial')) {
    return { type: 'cinematic', confidence: 0.75 };
  }
  
  if (sceneType === 'hook' || sceneType === 'cta') {
    return { type: 'cinematic', confidence: 0.6 };
  }
  
  return { type: 'b-roll', confidence: 0.5 };
}

const SceneContentTypeRow = ({
  scene,
  onContentTypeChange,
  isPending,
}: {
  scene: Scene;
  onContentTypeChange: (sceneId: string, contentType: string) => void;
  isPending?: boolean;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  
  const detected = detectContentType(scene);
  const detectedType = CONTENT_TYPES.find(t => t.value === detected.type);
  const confidence = detected.confidence;
  
  return (
    <div 
      className="flex items-center gap-3 p-2 bg-white rounded border border-amber-100"
      data-testid={`content-type-row-${scene.id}`}
    >
      <Badge variant="outline" className="shrink-0">
        Scene {scene.order}
      </Badge>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 truncate">
          {scene.visualDirection?.substring(0, 50)}
          {(scene.visualDirection?.length || 0) > 50 ? '...' : ''}
        </p>
      </div>
      
      {!isEditing && detectedType && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            Suggested: <strong>{detectedType.label}</strong>
          </span>
          <Badge 
            variant={confidence > 0.7 ? 'default' : 'secondary'}
            className="text-xs"
          >
            {Math.round(confidence * 100)}%
          </Badge>
        </div>
      )}
      
      {isEditing ? (
        <Select
          defaultValue={detected.type}
          onValueChange={(value) => {
            onContentTypeChange(scene.id, value);
            setIsEditing(false);
          }}
        >
          <SelectTrigger className="w-40" data-testid={`select-content-type-${scene.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                <div>
                  <div className="font-medium">{type.label}</div>
                  <div className="text-xs text-gray-500">{type.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsEditing(true)}
          disabled={isPending}
          data-testid={`button-change-content-type-${scene.id}`}
        >
          <Edit2 className="w-3 h-3 mr-1" />
          Change
        </Button>
      )}
      
      {!isEditing && detectedType && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onContentTypeChange(scene.id, detected.type)}
          disabled={isPending}
          data-testid={`button-accept-content-type-${scene.id}`}
        >
          <Check className="w-3 h-3 mr-1" />
          Accept
        </Button>
      )}
    </div>
  );
};

export const ContentTypeWarning = ({
  scenes,
  onContentTypeChange,
  onBatchContentTypeChange,
  isPending,
}: ContentTypeWarningProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const scenesNeedingAttention = scenes.filter(
    s => {
      // If user has explicitly set the content type, don't show warning
      if (s.contentTypeSource === 'user') return false;
      // Show warning if no content type or using default/auto values
      return !s.contentType || s.contentType === 'default' || s.contentType === 'auto';
    }
  );
  
  if (scenesNeedingAttention.length === 0) {
    return null;
  }
  
  const handleAcceptAll = () => {
    // Build list of updates
    const updates = scenesNeedingAttention.map(scene => {
      const detected = detectContentType(scene);
      return { sceneId: scene.id, contentType: detected.type };
    });
    
    // Use batch handler if available, otherwise fall back to individual updates
    if (onBatchContentTypeChange) {
      onBatchContentTypeChange(updates);
    } else {
      updates.forEach(({ sceneId, contentType }) => {
        onContentTypeChange(sceneId, contentType);
      });
    }
  };
  
  return (
    <Alert className="bg-amber-50 border-amber-200" data-testid="alert-content-type-warning">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
          <div className="flex-1">
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
              <AlertDescription className="text-amber-800 font-medium">
                {scenesNeedingAttention.length} scene(s) will use auto-detected content type
              </AlertDescription>
              <Button variant="ghost" size="sm" className="ml-auto" data-testid="button-review-content-types">
                {isOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <>
                    <Edit2 className="w-4 h-4 mr-1" />
                    Review
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="mt-3 space-y-2">
              <p className="text-sm text-amber-700 mb-3">
                Content type affects provider selection and quality checks. 
                Review and adjust if needed:
              </p>
              
              {scenesNeedingAttention.map((scene) => (
                <SceneContentTypeRow
                  key={scene.id}
                  scene={scene}
                  onContentTypeChange={onContentTypeChange}
                  isPending={isPending}
                />
              ))}
              
              <div className="pt-2 border-t border-amber-200 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAcceptAll}
                  disabled={isPending}
                  data-testid="button-accept-all-content-types"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Accept All Suggestions
                </Button>
              </div>
            </CollapsibleContent>
          </div>
        </div>
      </Collapsible>
    </Alert>
  );
};

export default ContentTypeWarning;
