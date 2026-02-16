import { AbsoluteFill } from 'remotion';
import { UniversalVideoComposition, UniversalVideoProps } from './UniversalVideoComposition';
import { FilmTreatment, FILM_TREATMENT_PRESETS } from './components/post-processing';
import { FilmTreatmentConfig } from '../shared/config/film-treatment';
import { TransitionConfig } from './components/transitions';

export interface BroadcastInputProps extends UniversalVideoProps {
  filmTreatment?: FilmTreatmentConfig;
  transitions?: TransitionConfig[];
}

export const BroadcastVideoComposition: React.FC<BroadcastInputProps> = (props) => {
  const {
    filmTreatment = FILM_TREATMENT_PRESETS['hero-cinematic'],
    ...universalProps
  } = props;

  return (
    <AbsoluteFill>
      <FilmTreatment config={filmTreatment}>
        <UniversalVideoComposition {...universalProps} />
      </FilmTreatment>
    </AbsoluteFill>
  );
};
