import type { Phase8AnalysisResult } from '../../shared/video-types';

export interface QualityThresholds {
  minimumSceneScore: number;
  minimumProjectScore: number;
  maximumCriticalIssues: number;
  maximumMajorIssues: number;
  requireUserApproval: boolean;
}

export interface SceneQualityStatus {
  sceneIndex: number;
  score: number;
  status: 'approved' | 'needs_review' | 'rejected' | 'pending';
  issues: Array<{
    severity: string;
    description: string;
  }>;
  userApproved: boolean;
  autoApproved: boolean;
  regenerationCount: number;
  thumbnailUrl?: string;
  narration?: string;
  provider?: string;
}

export interface SceneMetadata {
  thumbnailUrl?: string;
  narration?: string;
  provider?: string;
  regenerationCount?: number;
}

export interface ProjectQualityReport {
  projectId: string;
  overallScore: number;
  sceneStatuses: SceneQualityStatus[];
  approvedCount: number;
  needsReviewCount: number;
  rejectedCount: number;
  pendingCount: number;
  criticalIssueCount: number;
  majorIssueCount: number;
  minorIssueCount: number;
  passesThreshold: boolean;
  canRender: boolean;
  blockingReasons: string[];
  lastAnalyzedAt: string;
  lastApprovedAt?: string;
}

const DEFAULT_THRESHOLDS: QualityThresholds = {
  minimumSceneScore: 70,
  minimumProjectScore: 75,
  maximumCriticalIssues: 0,
  maximumMajorIssues: 3,
  requireUserApproval: true,
};

class QualityGateService {
  generateReport(
    projectId: string,
    sceneAnalyses: Phase8AnalysisResult[],
    userApprovals: Map<number, boolean>,
    thresholds: QualityThresholds = DEFAULT_THRESHOLDS,
    sceneMetadata?: Map<number, SceneMetadata>
  ): ProjectQualityReport {
    console.log(`[QualityGate] Generating report for project ${projectId} with ${sceneAnalyses.length} scenes`);
    
    const sceneStatuses: SceneQualityStatus[] = sceneAnalyses.map(analysis => {
      const userApproved = userApprovals.get(analysis.sceneIndex) || false;
      const autoApproved = analysis.overallScore >= 85;
      const metadata = sceneMetadata?.get(analysis.sceneIndex);
      
      let status: SceneQualityStatus['status'] = 'pending';
      if (userApproved || autoApproved) {
        status = 'approved';
      } else if (analysis.recommendation === 'regenerate') {
        status = 'rejected';
      } else if (analysis.overallScore < thresholds.minimumSceneScore) {
        status = 'rejected';
      } else {
        status = 'needs_review';
      }
      
      return {
        sceneIndex: analysis.sceneIndex,
        score: analysis.overallScore,
        status,
        issues: analysis.issues.map(i => ({
          severity: i.severity,
          description: i.description,
        })),
        userApproved,
        autoApproved,
        regenerationCount: metadata?.regenerationCount || 0,
        thumbnailUrl: metadata?.thumbnailUrl,
        narration: metadata?.narration,
        provider: metadata?.provider,
      };
    });
    
    const approvedCount = sceneStatuses.filter(s => s.status === 'approved').length;
    const needsReviewCount = sceneStatuses.filter(s => s.status === 'needs_review').length;
    const rejectedCount = sceneStatuses.filter(s => s.status === 'rejected').length;
    const pendingCount = sceneStatuses.filter(s => s.status === 'pending').length;
    
    let criticalCount = 0;
    let majorCount = 0;
    let minorCount = 0;
    
    for (const analysis of sceneAnalyses) {
      for (const issue of analysis.issues) {
        if (issue.severity === 'critical') criticalCount++;
        else if (issue.severity === 'major') majorCount++;
        else minorCount++;
      }
    }
    
    const overallScore = sceneStatuses.length > 0
      ? Math.round(sceneStatuses.reduce((sum, s) => sum + s.score, 0) / sceneStatuses.length)
      : 0;
    
    const blockingReasons: string[] = [];
    
    if (overallScore < thresholds.minimumProjectScore) {
      blockingReasons.push(`Overall score ${overallScore} below minimum ${thresholds.minimumProjectScore}`);
    }
    
    if (criticalCount > thresholds.maximumCriticalIssues) {
      blockingReasons.push(`${criticalCount} critical issues (max ${thresholds.maximumCriticalIssues})`);
    }
    
    if (majorCount > thresholds.maximumMajorIssues) {
      blockingReasons.push(`${majorCount} major issues (max ${thresholds.maximumMajorIssues})`);
    }
    
    if (rejectedCount > 0) {
      blockingReasons.push(`${rejectedCount} rejected scenes need regeneration`);
    }
    
    if (thresholds.requireUserApproval && needsReviewCount > 0) {
      blockingReasons.push(`${needsReviewCount} scenes need user review`);
    }
    
    const passesThreshold = blockingReasons.length === 0;
    // Phase 10D: Strict QA gate enforcement - canRender is ONLY true when NO blocking reasons exist
    // Previously: allowed rendering even with "needs review" scenes - this is now blocked
    const canRender = passesThreshold;
    
    console.log(`[QualityGate] Report: score=${overallScore}, approved=${approvedCount}, review=${needsReviewCount}, rejected=${rejectedCount}, canRender=${canRender}`);
    
    return {
      projectId,
      overallScore,
      sceneStatuses,
      approvedCount,
      needsReviewCount,
      rejectedCount,
      pendingCount,
      criticalIssueCount: criticalCount,
      majorIssueCount: majorCount,
      minorIssueCount: minorCount,
      passesThreshold,
      canRender,
      blockingReasons,
      lastAnalyzedAt: new Date().toISOString(),
    };
  }
  
  canProceedToRender(report: ProjectQualityReport): { allowed: boolean; reason: string; blockingReasons: string[] } {
    // Phase 10D: ALWAYS recompute blocking reasons from live data - never trust stored canRender
    const blockingReasons: string[] = [];
    
    if (report.rejectedCount > 0) {
      blockingReasons.push(`${report.rejectedCount} scene(s) rejected - must regenerate`);
    }
    
    if (report.needsReviewCount > 0) {
      blockingReasons.push(`${report.needsReviewCount} scene(s) need review - approve or regenerate`);
    }
    
    if (report.criticalIssueCount > 0) {
      blockingReasons.push(`${report.criticalIssueCount} critical issue(s) must be resolved`);
    }
    
    // Phase 10D: Check major issues threshold
    if (report.majorIssueCount > DEFAULT_THRESHOLDS.maximumMajorIssues) {
      blockingReasons.push(`${report.majorIssueCount} major issues (max ${DEFAULT_THRESHOLDS.maximumMajorIssues})`);
    }
    
    if (report.overallScore < DEFAULT_THRESHOLDS.minimumProjectScore) {
      blockingReasons.push(`Overall score ${report.overallScore} below minimum ${DEFAULT_THRESHOLDS.minimumProjectScore}`);
    }
    
    // Phase 10D: Compute allowed purely from blocking reasons, ignore stored canRender/passesThreshold
    const allowed = blockingReasons.length === 0;
    
    if (allowed) {
      return { allowed: true, reason: 'All quality checks passed', blockingReasons: [] };
    }
    
    return {
      allowed: false,
      reason: blockingReasons.join('; ') || 'Quality gate not passed',
      blockingReasons,
    };
  }
  
  approveScene(
    report: ProjectQualityReport,
    sceneIndex: number
  ): ProjectQualityReport {
    const updatedStatuses = report.sceneStatuses.map(s => {
      if (s.sceneIndex === sceneIndex) {
        return { ...s, status: 'approved' as const, userApproved: true };
      }
      return s;
    });
    
    const approvedCount = updatedStatuses.filter(s => s.status === 'approved').length;
    const needsReviewCount = updatedStatuses.filter(s => s.status === 'needs_review').length;
    
    const blockingReasons = report.blockingReasons.filter(
      r => !r.includes('user review') || needsReviewCount > 0
    );
    
    if (needsReviewCount > 0 && !blockingReasons.some(r => r.includes('user review'))) {
      blockingReasons.push(`${needsReviewCount} scenes need user review`);
    } else if (needsReviewCount === 0) {
      const idx = blockingReasons.findIndex(r => r.includes('user review'));
      if (idx >= 0) blockingReasons.splice(idx, 1);
    }
    
    // Phase 10D: Strict enforcement - canRender only when no blocking reasons
    const updatedPassesThreshold = blockingReasons.length === 0;
    
    return {
      ...report,
      sceneStatuses: updatedStatuses,
      approvedCount,
      needsReviewCount,
      blockingReasons,
      passesThreshold: updatedPassesThreshold,
      canRender: updatedPassesThreshold,
      lastApprovedAt: new Date().toISOString(),
    };
  }
  
  rejectScene(
    report: ProjectQualityReport,
    sceneIndex: number,
    reason: string
  ): ProjectQualityReport {
    const updatedStatuses = report.sceneStatuses.map(s => {
      if (s.sceneIndex === sceneIndex) {
        return { 
          ...s, 
          status: 'rejected' as const, 
          userApproved: false,
          issues: [...s.issues, { severity: 'major', description: `User rejected: ${reason}` }],
        };
      }
      return s;
    });
    
    const rejectedCount = updatedStatuses.filter(s => s.status === 'rejected').length;
    const needsReviewCount = updatedStatuses.filter(s => s.status === 'needs_review').length;
    
    let blockingReasons = report.blockingReasons.filter(r => !r.includes('rejected scenes'));
    blockingReasons.push(`${rejectedCount} rejected scenes need regeneration`);
    
    return {
      ...report,
      sceneStatuses: updatedStatuses,
      rejectedCount,
      needsReviewCount,
      blockingReasons,
      passesThreshold: false,
      canRender: false,
    };
  }
  
  autoApproveEligible(report: ProjectQualityReport): ProjectQualityReport {
    const updatedStatuses = report.sceneStatuses.map(s => {
      if (s.score >= 85 && s.status === 'needs_review') {
        return { ...s, status: 'approved' as const, autoApproved: true };
      }
      return s;
    });
    
    const approvedCount = updatedStatuses.filter(s => s.status === 'approved').length;
    const needsReviewCount = updatedStatuses.filter(s => s.status === 'needs_review').length;
    
    let blockingReasons = [...report.blockingReasons];
    const reviewIdx = blockingReasons.findIndex(r => r.includes('user review'));
    if (reviewIdx >= 0) {
      if (needsReviewCount > 0) {
        blockingReasons[reviewIdx] = `${needsReviewCount} scenes need user review`;
      } else {
        blockingReasons.splice(reviewIdx, 1);
      }
    }
    
    // Phase 10D: Strict enforcement - canRender only when no blocking reasons
    const updatedPassesThreshold = blockingReasons.length === 0;
    
    return {
      ...report,
      sceneStatuses: updatedStatuses,
      approvedCount,
      needsReviewCount,
      blockingReasons,
      passesThreshold: updatedPassesThreshold,
      canRender: updatedPassesThreshold,
    };
  }
  
  getDefaultThresholds(): QualityThresholds {
    return { ...DEFAULT_THRESHOLDS };
  }
}

export const qualityGateService = new QualityGateService();
