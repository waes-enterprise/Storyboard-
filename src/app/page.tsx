'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '@/components/storyboard/Sidebar';
import { ShotCanvas } from '@/components/storyboard/ShotCanvas';
import { KeyboardShortcuts } from '@/components/storyboard/KeyboardShortcuts';
import { LandingPage } from '@/components/storyboard/LandingPage';
import { WorkspaceDashboard } from '@/components/storyboard/WorkspaceDashboard';
import { useStoryboardStore } from '@/stores/storyboard';

type Phase = 'landing' | 'storyboard' | 'dashboard';

export default function Home() {
  const hydrate = useStoryboardStore((s) => s.hydrate);
  const shots = useStoryboardStore((s) => s.shots);
  const [phase, setPhase] = useState<Phase>('landing');

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Auto-detect: if shots already exist (from storage), go straight to storyboard
  useEffect(() => {
    if (shots.length > 0 && phase === 'landing') {
      setPhase('storyboard');
    }
  }, [shots.length, phase]);

  const handleGenerated = useCallback(() => {
    setPhase('storyboard');
  }, []);

  const handleNewStoryboard = useCallback(() => {
    setPhase('landing');
  }, []);

  const handleOpenDashboard = useCallback(() => {
    setPhase('dashboard');
  }, []);

  const handleResumeStoryboard = useCallback(() => {
    setPhase('storyboard');
  }, []);

  if (phase === 'dashboard') {
    return <WorkspaceDashboard onNewStoryboard={handleNewStoryboard} onResume={handleResumeStoryboard} />;
  }

  if (phase === 'landing') {
    return <LandingPage onGenerated={handleGenerated} />;
  }

  return (
    <>
      <main className="flex h-screen overflow-hidden bg-[#0A0A0C]">
        <Sidebar onNewStoryboard={handleNewStoryboard} onOpenDashboard={handleOpenDashboard} />
        <ShotCanvas />
      </main>
      <KeyboardShortcuts onNewStoryboard={handleNewStoryboard} />
    </>
  );
}
