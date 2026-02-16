import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Brain, Lightbulb, AlertTriangle, TrendingUp, ArrowRight, Zap, RefreshCw, ChevronRight, Gauge, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { apiRequest } from '@/lib/queryClient';

interface StrategyPreviewResult {
  success: boolean;
  complexity: {
    score: number;
    category: string;
    warning?: string;
  };
  strategy: {
    approach: string;
    reasoning: string;
    confidence: number;
    warning?: string;
    changes: {
      prompt?: string;
      provider?: string;
      negativePrompt?: string;
    };
  };
  suggestion: string;
}

interface StrategyPreviewCardProps {
  prompt: string;
  attemptCount?: number;
  currentMediaUrl?: string;
  previousIssues?: string[];
  onApplyStrategy?: (strategy: StrategyPreviewResult['strategy']) => void;
}

export const StrategyPreviewCard = ({
  prompt,
  attemptCount = 0,
  currentMediaUrl,
  previousIssues = [],
  onApplyStrategy,
}: StrategyPreviewCardProps) => {
  const [previewData, setPreviewData] = useState<StrategyPreviewResult | null>(null);

  const previewMutation = useMutation({
    mutationFn: async (): Promise<StrategyPreviewResult> => {
      const response = await apiRequest('POST', '/api/universal-video/regeneration/preview-strategy', {
        prompt,
        attemptCount,
        currentMediaUrl,
        previousIssues,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
    },
  });

  useEffect(() => {
    if (prompt && prompt.length > 10) {
      const debounceTimer = setTimeout(() => {
        previewMutation.mutate();
      }, 500);
      return () => clearTimeout(debounceTimer);
    }
  }, [prompt, attemptCount, currentMediaUrl, JSON.stringify(previousIssues)]);

  const getApproachIcon = (approach: string) => {
    switch (approach) {
      case 'retry':
        return <RefreshCw className="w-4 h-4" />;
      case 'alternative-provider':
        return <ArrowRight className="w-4 h-4" />;
      case 'simplify':
        return <Lightbulb className="w-4 h-4" />;
      case 'reference':
        return <Target className="w-4 h-4" />;
      case 'stock-footage':
        return <Zap className="w-4 h-4" />;
      default:
        return <Brain className="w-4 h-4" />;
    }
  };

  const getApproachColor = (approach: string) => {
    switch (approach) {
      case 'retry':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'alternative-provider':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'simplify':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'reference':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'stock-footage':
        return 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getApproachLabel = (approach: string) => {
    switch (approach) {
      case 'retry':
        return 'Smart Retry';
      case 'alternative-provider':
        return 'Switch Provider';
      case 'simplify':
        return 'Simplify Prompt';
      case 'reference':
        return 'Use Reference';
      case 'stock-footage':
        return 'Stock Footage';
      default:
        return approach;
    }
  };

  const getComplexityColor = (category: string) => {
    switch (category) {
      case 'simple':
        return 'text-green-600';
      case 'moderate':
        return 'text-blue-600';
      case 'complex':
        return 'text-amber-600';
      case 'impossible':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-500';
    if (confidence >= 60) return 'bg-blue-500';
    if (confidence >= 40) return 'bg-amber-500';
    return 'bg-red-500';
  };

  if (previewMutation.isPending) {
    return (
      <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-indigo-200 dark:border-indigo-800" data-testid="card-strategy-preview-loading">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-indigo-500 animate-pulse" />
            <span className="text-sm text-indigo-700 dark:text-indigo-300">
              Analyzing regeneration strategy...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!previewData) {
    return null;
  }

  const { complexity, strategy, suggestion } = previewData;

  return (
    <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-indigo-200 dark:border-indigo-800" data-testid="card-strategy-preview">
      <CardHeader className="py-3 pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-500" />
            <span>AI Strategy Preview</span>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge className={getApproachColor(strategy.approach)}>
                  {getApproachIcon(strategy.approach)}
                  <span className="ml-1">{getApproachLabel(strategy.approach)}</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{strategy.reasoning}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 pb-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Gauge className="w-3 h-3" />
              Prompt Complexity
            </div>
            <div className="flex items-center gap-2">
              <Progress 
                value={complexity.score} 
                className="h-1.5 flex-1"
              />
              <span className={`text-xs font-medium capitalize ${getComplexityColor(complexity.category)}`}>
                {complexity.category}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <TrendingUp className="w-3 h-3" />
              Confidence Score
            </div>
            <div className="flex items-center gap-2">
              <Progress 
                value={strategy.confidence} 
                className={`h-1.5 flex-1 [&>div]:${getConfidenceColor(strategy.confidence)}`}
              />
              <span className="text-xs font-medium">
                {strategy.confidence}%
              </span>
            </div>
          </div>
        </div>

        {(complexity.warning || strategy.warning) && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-700 dark:text-amber-300">
              {complexity.warning || strategy.warning}
            </div>
          </div>
        )}

        {strategy.changes.prompt && (
          <div className="space-y-1">
            <div className="text-xs text-gray-500 font-medium">Suggested Prompt Changes:</div>
            <div className="p-2 rounded-lg bg-white dark:bg-gray-900 text-xs text-gray-700 dark:text-gray-300 border">
              {strategy.changes.prompt.substring(0, 150)}
              {strategy.changes.prompt.length > 150 ? '...' : ''}
            </div>
          </div>
        )}

        {strategy.changes.provider && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Recommended Provider:</span>
            <Badge variant="outline">{strategy.changes.provider}</Badge>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-indigo-100 dark:border-indigo-800">
          <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400">
            <Lightbulb className="w-3 h-3" />
            <span>{suggestion}</span>
          </div>
          {onApplyStrategy && (
            <Button 
              size="sm" 
              variant="ghost" 
              className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
              onClick={() => onApplyStrategy(strategy)}
              data-testid="button-apply-strategy"
            >
              Apply
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default StrategyPreviewCard;
