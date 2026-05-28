/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Composition } from 'remotion';
import { PaniniPanoVideo } from './PaniniPanoVideo';
import { BrandingOutro } from './BrandingOutro';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PaniniPanoVideo"
        component={PaniniPanoVideo as any}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          clips: [],
          musicPath: null,
          brandingTheme: 'QuietHours',
          brandingEnabled: true,
          textOverlays: [],
        }}
      />
      <Composition
        id="BrandingOutro"
        component={BrandingOutro as any}
        durationInFrames={120}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ theme: 'QuietHours' }}
      />
    </>
  );
};
