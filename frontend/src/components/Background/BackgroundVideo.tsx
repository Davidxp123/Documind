'use client';

import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

export default function BackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const src = 'https://stream.mux.com/8wrHPCX2dC3msyYU9ObwqNdm00u3ViXvOSHUMRYSEe5Q.m3u8';
    let hlsInstance: Hls | null = null;

    const tryPlay = () => {
      if (!video) return;
      video.muted = true;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.log('[BackgroundVideo] Autoplay prevented, waiting for user interaction:', error);
        });
      }
    };

    if (Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        tryPlay();
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', tryPlay);
    }

    // Try playing immediately
    tryPlay();

    // Fallback for autoplay policy - retry on user interaction
    const handleInteraction = () => {
      tryPlay();
      // Remove listeners once we successfully trigger play (or just after first interaction)
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };

    window.addEventListener('pointerdown', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });

    return () => {
      if (hlsInstance) {
        hlsInstance.destroy();
      }
      if (video) {
        video.removeEventListener('loadedmetadata', tryPlay);
      }
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      className="pointer-events-none fixed inset-0 w-full h-full object-cover opacity-100"
      style={{ zIndex: -1 }}
      aria-hidden
    />
  );
}
