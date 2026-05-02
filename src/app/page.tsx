'use client';

import { useEffect } from 'react';
import { Sidebar } from '@/components/storyboard/Sidebar';
import { ShotCanvas } from '@/components/storyboard/ShotCanvas';
import { useStoryboardStore } from '@/stores/storyboard';

export default function Home() {
  const hydrate = useStoryboardStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <main className="flex h-screen overflow-hidden bg-[#0A0A0C]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Canvas */}
      <ShotCanvas />
    </main>
  );
}
