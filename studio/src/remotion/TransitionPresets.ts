import { linearTiming, type TransitionTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { wipe } from '@remotion/transitions/wipe';
import { slide } from '@remotion/transitions/slide';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPresentation = any;

export type TransitionType = 'cut' | 'crossfade' | 'wipe-left' | 'wipe-right' | 'slide';

export interface TransitionPreset {
  presentation: AnyPresentation;
  timing: TransitionTiming;
}

export const transitionPresets: Record<TransitionType, TransitionPreset> = {
  cut: {
    presentation: fade(),
    timing: linearTiming({ durationInFrames: 1 }),
  },
  crossfade: {
    presentation: fade(),
    timing: linearTiming({ durationInFrames: 15 }),
  },
  'wipe-left': {
    presentation: wipe({ direction: 'from-left' }),
    timing: linearTiming({ durationInFrames: 20 }),
  },
  'wipe-right': {
    presentation: wipe({ direction: 'from-right' }),
    timing: linearTiming({ durationInFrames: 20 }),
  },
  slide: {
    presentation: slide({ direction: 'from-right' }),
    timing: linearTiming({ durationInFrames: 20 }),
  },
};
