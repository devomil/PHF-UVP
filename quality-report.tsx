import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Loader2,
  Eye,
  Palette,
  Sparkles,
  Film,
  CheckSquare,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface QualityIssue {
  type: 'text-overlap' | 'face-blocked' | 'poor-visibility' | 'bad-composition' | 'technical' | 'content-mismatch';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  timestamp?: number;
  sceneIndex?: number;
}

interface SceneQualityScore {
  sceneId: string;
  sceneIndex: number;
  overallScore: number | null;  // Phase 10C: null indicates no real analysis
  scores: {
    composition: number;
    visibility: number;
    technicalQuality: number;
    contentMatch: number;
    professionalLook: number;
  } | null;  // Phase 10C: null indicates pending analysis
  issues: QualityIssue[];
  passesThreshold: boolean;
  needsRegeneration: boolean;
  status?: 'pending' | 'analyzed';  // Phase 10C: explicit status
  hasRealAnalysis?: boolean;  // Phase 10C: flag for real vs fake analysis
}

interface VideoQualityReport {
  projectId: string;
  overallScore: number | null;  // Phase 10C: null indicates pending analysis
  passesQuality: boolean;
  sceneScores: SceneQualityScore[];
  criticalIssues: QualityIssue[];
  recommendations: string[];
  evaluatedAt: string;
  recommendation?: 'approved' | 'needs-fixes' | 'needs-review' | 'pending';
  summary?: string;
  issues?: {
    total: number;
    critical: number;
    major: number;
    minor: number;
  };
  status?: 'analysis_pending';  // Phase 10C: explicit pending status
  hasRealAnalysis?: boolean;  // Phase 10C: flag for real vs fake analysis
}

interface QualityReportProps {
  projectId: string;
  projectStatus: string;
  onRegenerateComplete?: () => void;
  onApproveAndRender?: () => void;
}

const RECOMMENDATION_CONFIG = {
  approved: {
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    label: 'Ready to Render',
  },
  'needs-fixes': {
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    label: 'Needs Fixes',
  },
  'needs-review': {
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    label: 'Needs Review',
  },
  pending: {
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
    label: 'Pending',
  },
};

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 70) return 'text-yellow-600 dark:text-yellow-400';
  if (score >= 50) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-green-100 dark:bg-green-900/30';
  if (score >= 70) return 'bg-yellow-100 dark:bg-yellow-900/30';
  if (score >= 50) return 'bg-orange-100 dark:bg-orange-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

function getSeverityBadge(severity: 'critical' | 'major' | 'minor') {
  switch (severity) {
    case 'critical':
      return <Badge variant="destructive">Critical</Badge>;
    case 'major':
      return <Badge className="bg-orange-500 hover:bg-orange-600">Major</Badge>;
    case 'minor':
      return <Badge variant="secondary">Minor</Badge>;
  }
}

function ScoreBar({ label, score, icon }: { label: string; score: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <div className="flex justify-between text-sm mb-1">
          <span>{label}</span>
          <span className={getScoreColor(score)}>{score}/100</span>
        </div>
        <Progress value={score} className="h-2" />
      </div>
    </div>
  );
}

export function QualityReport({ projectId, projectStatus, onRegenerateComplete, onApproveAndRender }: QualityReportProps) {
  const [expandedScenes, setExpandedScenes] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  const { data: reportData, isLoading, refetch } = useQuery<{ success: boolean; qualityReport: VideoQualityReport }>({
    queryKey: ['/api/universal-video/projects', projectId, 'quality-report'],
    enabled: projectStatus === 'complete',
  });

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/universal-video/projects/${projectId}/evaluate-quality`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        // Phase 10C: Handle null scores in toast message
        const scoreDisplay = data.qualityReport.overallScore !== null && data.qualityReport.overallScore !== undefined
          ? `Score: ${data.qualityReport.overallScore}/100`
          : 'Analysis pending - run quality check to get real scores';
        toast({ title: 'Quality evaluation complete', description: scoreDisplay });
        queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', projectId, 'quality-report'] });
      } else {
        toast({ variant: 'destructive', title: 'Evaluation failed', description: data.error });
      }
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Evaluation failed', description: error.message });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (sceneIndices?: number[]) => {
      const res = await apiRequest('POST', `/api/universal-video/projects/${projectId}/regenerate-scenes`, {
        sceneIndices,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        const successCount = data.regenerated?.filter((r: any) => r.success).length || 0;
        toast({ 
          title: 'Regeneration complete', 
          description: `${successCount} scene(s) regenerated successfully${data.needsRerender ? '. Re-render recommended.' : ''}` 
        });
        queryClient.invalidateQueries({ queryKey: ['/api/universal-video/projects', projectId] });
        onRegenerateComplete?.();
      } else {
        toast({ variant: 'destructive', title: 'Regeneration failed', description: data.error });
      }
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Regeneration failed', description: error.message });
    },
  });

  const toggleScene = (index: number) => {
    const newExpanded = new Set(expandedScenes);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedScenes(newExpanded);
  };

  if (projectStatus !== 'complete') {
    return null;
  }

  const report = reportData?.qualityReport;

  return (
    <Card className="mt-4" data-testid="card-quality-report">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckSquare className="w-5 h-5" />
              Quality Report
            </CardTitle>
            <CardDescription>
              AI-powered quality evaluation of your rendered video
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {report?.recommendation && (
              <Badge 
                className={RECOMMENDATION_CONFIG[report.recommendation].color}
                data-testid="badge-recommendation"
              >
                {RECOMMENDATION_CONFIG[report.recommendation].label}
              </Badge>
            )}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => evaluateMutation.mutate()}
              disabled={evaluateMutation.isPending}
              data-testid="button-evaluate-quality"
            >
              {evaluateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {report ? 'Re-evaluate' : 'Evaluate Quality'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !report && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No quality report available</AlertTitle>
            <AlertDescription>
              Click "Evaluate Quality" to analyze your video for broadcast quality issues.
            </AlertDescription>
          </Alert>
        )}

        {report && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {/* Phase 10C: Show Pending for null/zero scores */}
              {report.overallScore === null || report.overallScore === 0 || report.status === 'analysis_pending' ? (
                <div className="text-center p-4 rounded-lg bg-gray-100 dark:bg-gray-800 min-w-[100px]">
                  <div className="text-xl font-bold text-gray-500 dark:text-gray-400">
                    Pending
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Analysis Required</div>
                </div>
              ) : (
                <div className={`text-center p-4 rounded-lg ${getScoreBg(report.overallScore)} min-w-[100px]`}>
                  <div className={`text-3xl font-bold ${getScoreColor(report.overallScore)}`}>
                    {report.overallScore}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Overall Score</div>
                </div>
              )}
              
              <div className="flex-1">
                {report.passesQuality ? (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">Passes Quality Check</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <XCircle className="w-5 h-5" />
                    <span className="font-medium">Needs Improvement</span>
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  {report.sceneScores.filter(s => s.passesThreshold).length} of {report.sceneScores.length} scenes pass quality threshold
                </p>
                <p className="text-xs text-muted-foreground">
                  Evaluated: {new Date(report.evaluatedAt).toLocaleString()}
                </p>
              </div>

              {report.sceneScores.some(s => s.needsRegeneration) && (
                <Button
                  onClick={() => regenerateMutation.mutate(undefined)}
                  disabled={regenerateMutation.isPending}
                  variant="outline"
                  data-testid="button-regenerate-all"
                >
                  {regenerateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  )}
                  Regenerate Failed Scenes
                </Button>
              )}
            </div>

            {report.criticalIssues.length > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Critical Issues Found</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    {report.criticalIssues.map((issue, i) => (
                      <li key={i} className="text-sm">
                        Scene {(issue.sceneIndex ?? 0) + 1}: {issue.description}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {report.recommendations.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3">
                <h4 className="font-medium text-sm mb-2">Recommendations</h4>
                <ul className="space-y-1">
                  {report.recommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="font-medium text-sm mb-3">Scene Quality Breakdown</h4>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2 pr-4">
                  {report.sceneScores.map((scene, index) => (
                    <Collapsible
                      key={scene.sceneId}
                      open={expandedScenes.has(index)}
                      onOpenChange={() => toggleScene(index)}
                    >
                      <CollapsibleTrigger className="w-full">
                        <div 
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                            scene.needsRegeneration ? 'border-red-200 dark:border-red-800' : 'border-muted'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {scene.passesThreshold ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                            <span className="font-medium text-sm">Scene {scene.sceneIndex + 1}</span>
                            {scene.issues.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {scene.issues.length} issue{scene.issues.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {/* Phase 10C: Show Pending for null/zero scores */}
                            {scene.overallScore === null || scene.overallScore === 0 || scene.status === 'pending' ? (
                              <span className="font-bold text-gray-500">Pending</span>
                            ) : (
                              <span className={`font-bold ${getScoreColor(scene.overallScore)}`}>
                                {scene.overallScore}/100
                              </span>
                            )}
                            <ChevronDown className={`w-4 h-4 transition-transform ${expandedScenes.has(index) ? 'rotate-180' : ''}`} />
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-2 p-3 bg-muted/30 rounded-lg space-y-3">
                          {/* Phase 10C: Show pending message if no real analysis */}
                          {scene.scores === null || scene.status === 'pending' ? (
                            <div className="text-center text-gray-500 py-4">
                              <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
                              <p className="text-sm">Analysis not performed yet</p>
                              <p className="text-xs text-muted-foreground">Run quality check to get real scores</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-2">
                              <ScoreBar label="Composition" score={scene.scores.composition} icon={<Palette className="w-4 h-4" />} />
                              <ScoreBar label="Visibility" score={scene.scores.visibility} icon={<Eye className="w-4 h-4" />} />
                              <ScoreBar label="Technical Quality" score={scene.scores.technicalQuality} icon={<Film className="w-4 h-4" />} />
                              <ScoreBar label="Content Match" score={scene.scores.contentMatch} icon={<CheckCircle2 className="w-4 h-4" />} />
                              <ScoreBar label="Professional Look" score={scene.scores.professionalLook} icon={<Sparkles className="w-4 h-4" />} />
                            </div>
                          )}

                          {scene.issues.length > 0 && (
                            <div className="border-t pt-2">
                              <h5 className="text-xs font-medium text-muted-foreground mb-2">Issues:</h5>
                              <div className="space-y-1">
                                {scene.issues.map((issue, i) => (
                                  <div key={i} className="flex items-start gap-2 text-sm">
                                    {getSeverityBadge(issue.severity)}
                                    <span>{issue.description}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {scene.needsRegeneration && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                regenerateMutation.mutate([scene.sceneIndex]);
                              }}
                              disabled={regenerateMutation.isPending}
                              data-testid={`button-regenerate-scene-${scene.sceneIndex}`}
                            >
                              {regenerateMutation.isPending ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3 h-3 mr-1" />
                              )}
                              Regenerate This Scene
                            </Button>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </ScrollArea>
            </div>
            
            {/* Phase 5E: Summary and Approve Button */}
            {report.summary && (
              <div className="bg-muted/50 rounded-lg p-3 mt-4" data-testid="section-summary">
                <p className="text-sm text-muted-foreground">{report.summary}</p>
              </div>
            )}
            
            {/* Issue Count Summary */}
            {report.issues && report.issues.total > 0 && (
              <div className="flex items-center gap-2 mt-2" data-testid="section-issue-counts">
                <span className="text-sm text-muted-foreground">Issues:</span>
                {report.issues.critical > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {report.issues.critical} Critical
                  </Badge>
                )}
                {report.issues.major > 0 && (
                  <Badge className="bg-orange-500 hover:bg-orange-600 text-xs">
                    {report.issues.major} Major
                  </Badge>
                )}
                {report.issues.minor > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {report.issues.minor} Minor
                  </Badge>
                )}
              </div>
            )}
            
            {/* Approve and Render Button */}
            {onApproveAndRender && (
              <div className="flex items-center justify-end pt-4 border-t mt-4" data-testid="section-actions">
                <Button
                  onClick={onApproveAndRender}
                  disabled={report.recommendation === 'pending' || (report.issues?.critical ?? 0) > 0}
                  data-testid="button-approve-render"
                >
                  {report.recommendation === 'approved' 
                    ? 'Approve & Finalize' 
                    : 'Render Anyway'}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
