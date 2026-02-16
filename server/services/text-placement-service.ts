import { SceneAnalysis, SafeZones } from './scene-analysis-service';

export interface TextOverlay {
  id: string;
  text: string;
  type: 'lower_third' | 'title' | 'subtitle' | 'caption' | 'cta';
}

export interface TextStyle {
  fontSize: number;
  fontWeight: 'normal' | 'bold' | 'semibold';
  fontFamily: string;
  color: string;
  backgroundColor?: string;
  padding?: number;
  borderRadius?: number;
  shadow?: boolean;
}

export interface TextPlacement {
  overlay: TextOverlay;
  position: {
    x: number;
    y: number;
    anchor: string;
  };
  animation: {
    enter: string;
    exit: string;
    duration: number;
  };
  timing: {
    startFrame: number;
    endFrame: number;
  };
  style: TextStyle;
  placementReason: string;
}

export interface LegacyTextPlacement {
  sceneIndex: number;
  hasTextOverlay: boolean;
  placement: {
    position: 'top' | 'center' | 'bottom' | 'lower-third';
    alignment: 'left' | 'center' | 'right';
    safeZone: boolean;
  } | null;
  reason: string;
}

const DEFAULT_STYLES: Record<string, TextStyle> = {
  lower_third: {
    fontSize: 32,
    fontWeight: 'semibold',
    fontFamily: 'Inter, sans-serif',
    color: '#FFFFFF',
    backgroundColor: 'rgba(45, 90, 39, 0.85)',
    padding: 16,
    borderRadius: 4,
    shadow: true,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    fontFamily: 'Inter, sans-serif',
    color: '#FFFFFF',
    shadow: true,
  },
  subtitle: {
    fontSize: 24,
    fontWeight: 'normal',
    fontFamily: 'Inter, sans-serif',
    color: '#FFFFFF',
    shadow: true,
  },
  caption: {
    fontSize: 20,
    fontWeight: 'normal',
    fontFamily: 'Inter, sans-serif',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 8,
    borderRadius: 4,
  },
  cta: {
    fontSize: 36,
    fontWeight: 'bold',
    fontFamily: 'Inter, sans-serif',
    color: '#FFFFFF',
    backgroundColor: '#D4A574',
    padding: 20,
    borderRadius: 8,
    shadow: true,
  },
};

const POSITION_COORDS: Record<string, { x: number; y: number; anchor: string }> = {
  'lower-third': { x: 50, y: 85, anchor: 'bottom-center' },
  'bottom-left': { x: 10, y: 90, anchor: 'bottom-left' },
  'bottom-center': { x: 50, y: 92, anchor: 'bottom-center' },
  'bottom-right': { x: 90, y: 90, anchor: 'bottom-right' },
  'top-center': { x: 50, y: 15, anchor: 'top-center' },
  'top-left': { x: 10, y: 10, anchor: 'top-left' },
  'top-right': { x: 90, y: 10, anchor: 'top-right' },
  'center': { x: 50, y: 50, anchor: 'center' },
  'middle-left': { x: 15, y: 50, anchor: 'middle-left' },
  'middle-right': { x: 85, y: 50, anchor: 'middle-right' },
};

interface FrameAnalysis {
  faceRegion?: { x: number; y: number; width: number; height: number };
  safeTextZones?: Array<{ position: string }>;
  busyRegions?: string[];
  dominantColors: string[];
  lightingType: string;
  safeZones?: SafeZones;
}

interface SceneForPlacement {
  sceneIndex: number;
  sceneType: string;
  contentType: string;
  hasText: boolean;
  textContent?: string;
  analysisResult?: {
    faceRegions?: Array<{ x: number; y: number; width: number; height: number }>;
    subjectPosition?: 'left' | 'center' | 'right';
    busyRegions?: string[];
  };
}

class TextPlacementService {
  calculatePlacements(
    overlays: TextOverlay[],
    analysis: SceneAnalysis | null,
    sceneDuration: number,
    fps: number = 30
  ): { placements: TextPlacement[]; stats: { uniqueCount: number; skipped: number } } {
    const uniqueOverlays = this.deduplicateOverlays(overlays);
    const placements: TextPlacement[] = [];
    let skipped = 0;

    const frameAnalysis = this.convertToFrameAnalysis(analysis);

    for (const overlay of uniqueOverlays) {
      const position = this.findBestPosition(
        overlay.type,
        frameAnalysis,
        placements
      );

      if (!position) {
        console.warn(`[TextPlacement] No position found for: ${overlay.text.substring(0, 30)}`);
        skipped++;
        continue;
      }

      const style = this.adjustStyleForBackground(
        DEFAULT_STYLES[overlay.type] || DEFAULT_STYLES.caption,
        frameAnalysis.dominantColors,
        frameAnalysis.lightingType
      );

      const animation = this.selectAnimation(overlay.type);
      const timing = this.calculateTiming(overlay.type, sceneDuration, fps);

      placements.push({
        overlay,
        position,
        animation,
        timing,
        style,
        placementReason: position.reason,
      });
    }

    this.resolveOverlaps(placements);

    return {
      placements,
      stats: {
        uniqueCount: uniqueOverlays.length,
        skipped,
      },
    };
  }

  async determineTextPlacements(scenes: SceneForPlacement[]): Promise<LegacyTextPlacement[]> {
    return scenes.map(scene => {
      if (!scene.hasText) {
        return {
          sceneIndex: scene.sceneIndex,
          hasTextOverlay: false,
          placement: null,
          reason: 'No text overlay needed',
        };
      }

      const placement = this.calculateLegacyPlacement(scene);

      return {
        sceneIndex: scene.sceneIndex,
        hasTextOverlay: true,
        placement,
        reason: this.getPlacementReason(scene, placement),
      };
    });
  }

  private convertToFrameAnalysis(analysis: SceneAnalysis | null): FrameAnalysis {
    if (!analysis) {
      return {
        dominantColors: [],
        lightingType: 'neutral',
      };
    }

    const faceRegion = analysis.faces.detected && analysis.faces.positions.length > 0
      ? analysis.faces.positions[0]
      : undefined;

    const safeTextZones: Array<{ position: string }> = [];
    if (analysis.safeZones) {
      if (analysis.safeZones.topLeft) safeTextZones.push({ position: 'top-left' });
      if (analysis.safeZones.topCenter) safeTextZones.push({ position: 'top-center' });
      if (analysis.safeZones.topRight) safeTextZones.push({ position: 'top-right' });
      if (analysis.safeZones.bottomLeft) safeTextZones.push({ position: 'bottom-left' });
      if (analysis.safeZones.bottomCenter) safeTextZones.push({ position: 'bottom-center' });
      if (analysis.safeZones.bottomRight) safeTextZones.push({ position: 'bottom-right' });
      if (analysis.safeZones.middleCenter) safeTextZones.push({ position: 'center' });
      if (analysis.safeZones.middleLeft) safeTextZones.push({ position: 'middle-left' });
      if (analysis.safeZones.middleRight) safeTextZones.push({ position: 'middle-right' });
      if (analysis.safeZones.bottomCenter || analysis.safeZones.bottomLeft || analysis.safeZones.bottomRight) {
        safeTextZones.push({ position: 'lower-third' });
      }
    }

    const busyRegions: string[] = [];
    if (analysis.safeZones) {
      if (!analysis.safeZones.topLeft) busyRegions.push('top-left');
      if (!analysis.safeZones.topCenter) busyRegions.push('top-center');
      if (!analysis.safeZones.topRight) busyRegions.push('top-right');
      if (!analysis.safeZones.middleLeft) busyRegions.push('middle-left');
      if (!analysis.safeZones.middleCenter) busyRegions.push('center');
      if (!analysis.safeZones.middleRight) busyRegions.push('middle-right');
      if (!analysis.safeZones.bottomLeft) busyRegions.push('bottom-left');
      if (!analysis.safeZones.bottomCenter) busyRegions.push('bottom-center');
      if (!analysis.safeZones.bottomRight) busyRegions.push('bottom-right');
    }

    return {
      faceRegion,
      safeTextZones,
      busyRegions,
      dominantColors: analysis.composition.dominantColors,
      lightingType: analysis.composition.brightness === 'bright' ? 'warm' : 'neutral',
      safeZones: analysis.safeZones,
    };
  }

  private deduplicateOverlays(overlays: TextOverlay[]): TextOverlay[] {
    const seen = new Set<string>();
    return overlays.filter(overlay => {
      const key = `${overlay.text}-${overlay.type}`;
      if (seen.has(key)) {
        console.warn(`[TextPlacement] Duplicate removed: "${overlay.text}"`);
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private findBestPosition(
    type: string,
    frameAnalysis: FrameAnalysis,
    existingPlacements: TextPlacement[]
  ): { x: number; y: number; anchor: string; reason: string } | null {
    const preferences: Record<string, string[]> = {
      lower_third: ['lower-third', 'bottom-left', 'bottom-right'],
      title: ['center', 'top-center'],
      subtitle: ['center', 'bottom-center'],
      caption: ['bottom-center', 'lower-third'],
      cta: ['center', 'bottom-center'],
    };

    const preferredPositions = preferences[type] || ['lower-third'];
    const faceRegion = frameAnalysis.faceRegion;
    const safeZones = frameAnalysis.safeTextZones || [];
    const busyRegions = frameAnalysis.busyRegions || [];

    let bestPosition: { x: number; y: number; anchor: string; reason: string } | null = null;
    let bestScore = -999;

    for (const posName of Object.keys(POSITION_COORDS)) {
      const coords = POSITION_COORDS[posName];
      let score = 50;
      let reason = '';

      if (preferredPositions.includes(posName)) {
        score += 30;
        reason = `Preferred for ${type}`;
      }

      if (safeZones.find(z => z.position === posName)) {
        score += 20;
        reason += reason ? ', safe zone' : 'Safe zone';
      }

      if (faceRegion && this.overlapsRegion(coords, faceRegion)) {
        score -= 100;
        reason += reason ? ', BLOCKED BY FACE' : 'BLOCKED BY FACE';
      }

      if (busyRegions.includes(posName)) {
        score -= 25;
        reason += reason ? ', busy area' : 'Busy area';
      }

      if (posName === 'lower-third' && (busyRegions.includes('bottom-center') || busyRegions.includes('bottom-left') || busyRegions.includes('bottom-right'))) {
        score -= 15;
        reason += reason ? ', lower area busy' : 'Lower area busy';
      }

      for (const existing of existingPlacements) {
        if (this.positionsOverlap(coords, existing.position)) {
          score -= 50;
          reason += reason ? ', text overlap' : 'Text overlap';
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestPosition = { ...coords, reason };
      }
    }

    return bestScore > 0 ? bestPosition : null;
  }

  private overlapsRegion(
    position: { x: number; y: number },
    region: { x: number; y: number; width: number; height: number }
  ): boolean {
    const px = position.x / 100;
    const py = position.y / 100;
    const padding = 0.1;

    return (
      px >= region.x - padding &&
      px <= region.x + region.width + padding &&
      py >= region.y - padding &&
      py <= region.y + region.height + padding
    );
  }

  private positionsOverlap(pos1: { x: number; y: number }, pos2: { x: number; y: number }): boolean {
    return Math.abs(pos1.x - pos2.x) < 20 && Math.abs(pos1.y - pos2.y) < 15;
  }

  private adjustStyleForBackground(
    baseStyle: TextStyle,
    dominantColors: string[],
    lightingType: string
  ): TextStyle {
    const style = { ...baseStyle };

    const isLightBackground = lightingType === 'warm' ||
      dominantColors.some(c => ['white', 'cream', 'beige', 'yellow'].some(lc => c.toLowerCase().includes(lc)));

    if (isLightBackground && !style.backgroundColor) {
      style.shadow = true;
      style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      style.padding = style.padding || 12;
    }

    return style;
  }

  private selectAnimation(type: string): TextPlacement['animation'] {
    const animations: Record<string, TextPlacement['animation']> = {
      lower_third: { enter: 'slide-up', exit: 'fade', duration: 0.4 },
      title: { enter: 'fade', exit: 'fade', duration: 0.6 },
      subtitle: { enter: 'fade', exit: 'fade', duration: 0.4 },
      caption: { enter: 'fade', exit: 'fade', duration: 0.3 },
      cta: { enter: 'pop', exit: 'fade', duration: 0.5 },
    };
    return animations[type] || animations.caption;
  }

  private calculateTiming(type: string, sceneDuration: number, fps: number): TextPlacement['timing'] {
    const totalFrames = Math.round(sceneDuration * fps);

    switch (type) {
      case 'title':
        return { startFrame: Math.round(fps * 0.3), endFrame: totalFrames - Math.round(fps * 0.3) };
      case 'lower_third':
        return { startFrame: Math.round(fps * 0.8), endFrame: totalFrames - Math.round(fps * 0.3) };
      case 'cta':
        return { startFrame: Math.round(totalFrames * 0.5), endFrame: totalFrames };
      default:
        return { startFrame: Math.round(fps * 0.5), endFrame: totalFrames - Math.round(fps * 0.2) };
    }
  }

  private resolveOverlaps(placements: TextPlacement[]): void {
    for (let i = 1; i < placements.length; i++) {
      for (let j = 0; j < i; j++) {
        const p1 = placements[i];
        const p2 = placements[j];

        if (!this.positionsOverlap(p1.position, p2.position)) continue;

        const timeOverlap = p1.timing.startFrame < p2.timing.endFrame &&
                           p2.timing.startFrame < p1.timing.endFrame;

        if (timeOverlap) {
          p1.timing.startFrame = p2.timing.endFrame + 10;
          console.log(`[TextPlacement] Resolved overlap: "${p1.overlay.text.substring(0, 20)}" delayed`);
        }
      }
    }
  }

  private calculateLegacyPlacement(scene: SceneForPlacement): LegacyTextPlacement['placement'] {
    const analysis = scene.analysisResult;

    if (analysis?.faceRegions?.length && analysis.faceRegions.length > 0) {
      const faceY = analysis.faceRegions[0].y;

      if (faceY < 0.5) {
        return {
          position: 'lower-third',
          alignment: 'center',
          safeZone: true,
        };
      }

      return {
        position: 'top',
        alignment: 'center',
        safeZone: true,
      };
    }

    if (analysis?.subjectPosition === 'left') {
      return {
        position: 'lower-third',
        alignment: 'right',
        safeZone: true,
      };
    }

    if (analysis?.subjectPosition === 'right') {
      return {
        position: 'lower-third',
        alignment: 'left',
        safeZone: true,
      };
    }

    return {
      position: 'lower-third',
      alignment: 'center',
      safeZone: true,
    };
  }

  private getPlacementReason(scene: SceneForPlacement, placement: LegacyTextPlacement['placement']): string {
    const analysis = scene.analysisResult;

    if (analysis?.faceRegions?.length && analysis.faceRegions.length > 0) {
      return `Avoiding face region - text at ${placement?.position}`;
    }

    if (analysis?.subjectPosition) {
      return `Subject ${analysis.subjectPosition} - text aligned ${placement?.alignment}`;
    }

    return 'Standard lower-third placement';
  }

  getDefaultStyles(): Record<string, TextStyle> {
    return { ...DEFAULT_STYLES };
  }

  getPositionCoords(): Record<string, { x: number; y: number; anchor: string }> {
    return { ...POSITION_COORDS };
  }
}

export const textPlacementService = new TextPlacementService();
