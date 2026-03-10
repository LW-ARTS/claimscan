'use client';

import Grainient from '@/components/Grainient';

export function GrainientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 bg-[#c4c4c4] [backface-visibility:hidden] [transform:translateZ(0)]">
      <Grainient
        color1="#ffffff"
        color2="#919191"
        color3="#7a7a7a"
        timeSpeed={1.55}
        colorBalance={0}
        warpStrength={1.6}
        warpFrequency={7.6}
        warpSpeed={3.7}
        warpAmplitude={50}
        blendAngle={-54}
        blendSoftness={0.32}
        rotationAmount={500}
        noiseScale={0.35}
        grainAmount={0.03}
        grainScale={0.8}
        grainAnimated
        contrast={1.5}
        gamma={1}
        saturation={1}
        centerX={0}
        centerY={0}
        zoom={0.9}
      />
    </div>
  );
}
