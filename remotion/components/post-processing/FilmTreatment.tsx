import { AbsoluteFill } from 'remotion';
import { ColorGrading } from './ColorGrading';
import { FilmGrain } from './FilmGrain';
import { Vignette } from './Vignette';
import { Letterbox } from './Letterbox';
import { FilmTreatmentConfig, FILM_TREATMENT_PRESETS } from '../../../shared/config/film-treatment';

export type { FilmTreatmentConfig };
export { FILM_TREATMENT_PRESETS };

interface FilmTreatmentProps {
  config: FilmTreatmentConfig;
  children: React.ReactNode;
}

export const FilmTreatment: React.FC<FilmTreatmentProps> = ({
  config,
  children,
}) => {
  if (!config.enabled) {
    return <>{children}</>;
  }

  return (
    <AbsoluteFill>
      <ColorGrading preset={config.colorGrade} intensity={config.colorIntensity}>
        {children}
      </ColorGrading>

      <FilmGrain intensity={config.grainIntensity} />
      <Vignette intensity={config.vignetteIntensity} />
      <Letterbox aspectRatio={config.letterbox} />
    </AbsoluteFill>
  );
};
