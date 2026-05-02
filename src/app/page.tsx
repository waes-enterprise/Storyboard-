'use client';

import { useEffect } from 'react';
import { Sidebar } from '@/components/storyboard/Sidebar';
import { ShotCanvas } from '@/components/storyboard/ShotCanvas';
import { PresentationMode } from '@/components/storyboard/PresentationMode';
import { KeyboardShortcuts } from '@/components/storyboard/KeyboardShortcuts';
import { useStoryboardStore } from '@/stores/storyboard';

export default function Home() {
  const hydrate = useStoryboardStore((s) => s.hydrate);
  const isPresentationMode = useStoryboardStore((s) => s.isPresentationMode);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Lock body scroll in presentation mode
  useEffect(() => {
    if (isPresentationMode) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isPresentationMode]);

  return (
    <>
      <main className="flex h-screen overflow-hidden bg-[#0A0A0C]">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Canvas */}
        <ShotCanvas />
      </main>

      {/* Presentation Mode Overlay */}
      <PresentationMode />

      {/* Keyboard Shortcuts */}
      <KeyboardShortcuts />
    </>
  );
}
