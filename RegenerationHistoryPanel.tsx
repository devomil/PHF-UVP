import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Clock, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

interface RegenerationAttempt {
  attemptNumber: number;
  timestamp: string;
  provider: string;
  prompt: string;
  result: 'success' | 'failure' | 'partial';
  qualityScore?: number;
  issues?: string[];
}

interface RegenerationHistoryPanelProps {
  projectId: string;
  sceneId: string;
  sceneIndex: number;
  onViewDetails?: (attempt: RegenerationAttempt) => void;
}

export const RegenerationHistoryPanel = ({
  projectId,
  sceneId,
  sceneIndex,
  onViewDetails,
}: RegenerationHistoryPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const historyUrl = `/api/universal-video/projects/${projectId}/scenes/${sceneId}/regeneration-history`;
  
  const { data, isLoading, error, refetch } = useQuery<{
    success: boolean;
    sceneId: string;
    history: RegenerationAttempt[];
    attemptCount: number;
  }>({
    queryKey: [historyUrl],
    enabled: !!projectId && !!sceneId,
    staleTime: 30000,
  });

  if (error) {
    console.error('[RegenerationHistory] Error loading history:', { 
      url: historyUrl,
      projectId, 
      sceneId, 
      error: error.message 
    });
  }

  const history = data?.history || [];
  const hasHistory = history.length > 0;

  const getResultIcon = (result: string) => {
    switch (result) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failure':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'partial':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'success':
        return <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Success</Badge>;
      case 'failure':
        return <Badge variant="destructive">Failed</Badge>;
      case 'partial':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Partial</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const getProviderLabel = (provider: string) => {
    const labels: Record<string, string> = {
      'flux': 'Flux.1',
      'kling-2.0': 'Kling 2.0',
      'kling-2.6-motion-control-pro': 'Kling Motion Pro',
      'kling-2.6-pro': 'Kling Pro',
      'kling-2.6': 'Kling 2.6',
      'runway': 'Runway',
      'luma': 'Luma',
      'falai': 'fal.ai',
      'stability': 'Stability',
      'pexels': 'Pexels Stock',
    };
    return labels[provider] || provider;
  };

  if (isLoading) {
    return (
      <Card className="bg-gray-50 dark:bg-gray-900/50 border-dashed" data-testid="card-regeneration-history-loading">
        <CardHeader className="py-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="pb-3">
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" data-testid="card-regeneration-history-error">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <XCircle className="w-4 h-4" />
              <span>Failed to load regeneration history</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => refetch()}
              className="text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
              data-testid="button-retry-history"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasHistory) {
    return (
      <Card className="bg-gray-50 dark:bg-gray-900/50 border-dashed" data-testid="card-regeneration-history-empty">
        <CardContent className="py-4 text-center">
          <History className="w-8 h-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No regeneration history for Scene {sceneIndex + 1}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            History will appear here when you regenerate this scene
          </p>
        </CardContent>
      </Card>
    );
  }

  const successRate = history.length > 0 
    ? Math.round((history.filter(h => h.result === 'success').length / history.length) * 100)
    : 0;

  const avgQuality = history.filter(h => h.qualityScore !== undefined).length > 0
    ? Math.round(
        history
          .filter(h => h.qualityScore !== undefined)
          .reduce((sum, h) => sum + (h.qualityScore || 0), 0) / 
        history.filter(h => h.qualityScore !== undefined).length
      )
    : null;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className="bg-white dark:bg-gray-900" data-testid="card-regeneration-history">
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <History className="w-4 h-4 text-blue-500" />
                Regeneration History
                <Badge variant="outline" className="ml-1">{history.length}</Badge>
              </CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">Success:</span>
                  <span className={successRate >= 50 ? 'text-green-600' : 'text-amber-600'}>
                    {successRate}%
                  </span>
                </div>
                {avgQuality !== null && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">Avg Quality:</span>
                    <span className={avgQuality >= 70 ? 'text-green-600' : 'text-amber-600'}>
                      {avgQuality}
                    </span>
                  </div>
                )}
                <Button variant="ghost" size="sm" className="p-1 h-auto" data-testid="button-toggle-history">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-3">
            <div className="space-y-2">
              {history.slice(0, 5).map((attempt, index) => (
                <div
                  key={`${attempt.attemptNumber}-${index}`}
                  className="flex items-start gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  onClick={() => onViewDetails?.(attempt)}
                  data-testid={`history-item-${attempt.attemptNumber}`}
                >
                  <div className="pt-0.5">{getResultIcon(attempt.result)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">Attempt #{attempt.attemptNumber}</span>
                      {getResultBadge(attempt.result)}
                      <Badge variant="outline" className="text-xs">
                        {getProviderLabel(attempt.provider)}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                      {attempt.prompt.substring(0, 80)}...
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-gray-400">{formatTime(attempt.timestamp)}</span>
                      {attempt.qualityScore !== undefined && (
                        <div className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          <span className="text-xs text-gray-500">
                            Quality: {attempt.qualityScore.toFixed(0)}
                          </span>
                        </div>
                      )}
                      {attempt.issues && attempt.issues.length > 0 && (
                        <span className="text-xs text-red-500">
                          {attempt.issues.length} issue{attempt.issues.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {history.length > 5 && (
                <p className="text-xs text-center text-gray-400 pt-2">
                  + {history.length - 5} more attempts
                </p>
              )}
            </div>

            <div className="flex justify-end mt-3">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={(e) => {
                  e.stopPropagation();
                  refetch();
                }}
                data-testid="button-refresh-history"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default RegenerationHistoryPanel;
