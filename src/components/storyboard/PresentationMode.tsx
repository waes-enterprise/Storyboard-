'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useStoryboardStore } from '@/stores/storyboard';
import { SHOT_TYPES } from '@/types/storyboard';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
} from 'lucide-react';

export function PresentationMode() {
  const {
    shots,
    title,
    style,
    presentationIndex,
    isPresentationMode,
    setPresentationMode,
    nextShot,
    prevShot,
  } = useStoryboardStore();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [transitionDirection, setTransitionDirection] = useState<'left' | 'right'>('right');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIndexRef = useRef(presentationIndex);

  const currentShot = shots[presentationIndex];
  const shotTypeLabel = SHOT_TYPES.find((t) => t.value === currentShot?.shotType)?.full || currentShot?.shotType;

  // Detect transition direction
  useEffect(() => {
    if (presentationIndex !== prevIndexRef.current) {
      setTransitionDirection(presentationIndex > prevIndexRef.current ? 'right' : 'left');
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 400);
      prevIndexRef.current = presentationIndex;
      return () => clearTimeout(timer);
    }
  }, [presentationIndex]);

  // Lock body scroll when presenting
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

  // Auto-hide controls after 3 seconds of inactivity
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3000);
  }, []);

  useEffect(() => {
    if (isPresentationMode) {
      resetHideTimer();
      const handleMouseMove = () => resetHideTimer();
      window.addEventListener('mousemove', handleMouseMove);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      };
    }
  }, [isPresentationMode, resetHideTimer]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          setPresentationMode(false);
          break;
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          nextShot();
          break;
        case 'ArrowLeft':
        case 'Backspace':
          e.preventDefault();
          prevShot();
          break;
        case 'Home':
          e.preventDefault();
          useStoryboardStore.getState().setPresentationIndex(0);
          break;
        case 'End':
          e.preventDefault();
          useStoryboardStore.getState().setPresentationIndex(shots.length - 1);
          break;
      }
    },
    [nextShot, prevShot, setPresentationMode, shots.length]
  );

  useEffect(() => {
    if (isPresentationMode) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isPresentationMode, handleKeyDown]);

  if (!isPresentationMode || !currentShot) return null;

  const progress = shots.length > 0 ? ((presentationIndex + 1) / shots.length) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-[100] bg-[#0A0A0C] flex flex-col items-center justify-center"
      style={{ cursor: controlsVisible ? 'default' : 'none' }}
    >
      {/* ── Top Bar ── */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 z-20 transition-opacity duration-500"
        style={{ opacity: controlsVisible ? 1 : 0 }}
      >
        <div className="flex items-center gap-4">
          <h2 className="text-[#F0EDE8] font-heading text-lg truncate max-w-md">
            {title || 'Untitled Storyboard'}
          </h2>
          <span className="text-xs text-[#8A8A8E] bg-[#1A1A1F] px-2.5 py-1 rounded-full border border-[#2A2A30]">
            {style}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Progress indicator "3 / 8" */}
          <span className="text-sm text-[#E8C547] font-mono font-semibold tabular-nums">
            {presentationIndex + 1} / {shots.length}
          </span>
          <button
            onClick={() => setPresentationMode(false)}
            className="p-2 text-[#8A8A8E] hover:text-[#F0EDE8] hover:bg-[#1A1A1F] rounded-lg transition-all"
            title="Exit (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Top Progress Bar ── */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#1A1A1F] z-30">
        <div
          className="h-full bg-[#E8C547] transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ── Main Shot Display ── */}
      <div className="flex-1 flex items-center justify-center w-full px-8 py-20">
        <div
          className="w-full max-w-6xl relative"
          style={{
            transform: isTransitioning
              ? transitionDirection === 'right'
                ? 'translateX(20px)'
                : 'translateX(-20px)'
              : 'translateX(0)',
            opacity: isTransitioning ? 0.3 : 1,
            transition: 'transform 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 400ms ease-in-out',
          }}
        >
          {/* Image Container */}
          <div className="relative aspect-video bg-[#0A0A0C] rounded-xl overflow-hidden border border-[#2A2A30] shadow-2xl shadow-black/60">
            {currentShot.imageUrl ? (
              <img
                src={currentShot.imageUrl}
                alt={`Shot ${currentShot.shotNumber}`}
                className="w-full h-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[#555] gap-3">
                <Maximize2 className="w-12 h-12" />
                <span className="text-sm">No image available</span>
              </div>
            )}

            {/* Shot Number & Type Overlay — top-left */}
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <span className="bg-[#E8C547] text-[#0A0A0C] text-sm font-bold px-3 py-1 rounded-md">
                SHOT {currentShot.shotNumber}
              </span>
              <span className="bg-[#1A1A1F]/90 text-[#8A8A8E] text-xs px-2.5 py-1 rounded-md border border-[#2A2A30] backdrop-blur-sm">
                {shotTypeLabel}
              </span>
            </div>

            {/* Action Description Overlay — bottom gradient */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-16 pb-4 px-6">
              <p className="text-[#F0EDE8] text-lg md:text-xl leading-relaxed font-heading drop-shadow-lg">
                {currentShot.actionDescription}
              </p>
              {currentShot.cameraNote && (
                <p className="text-sm text-[#E8C547]/80 italic mt-1.5 drop-shadow-md">
                  🎬 {currentShot.cameraNote}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Navigation Bar ── */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-6 py-4 z-20 transition-opacity duration-500"
        style={{ opacity: controlsVisible ? 1 : 0 }}
      >
        <button
          onClick={prevShot}
          disabled={presentationIndex === 0}
          className="p-3 text-[#8A8A8E] hover:text-[#F0EDE8] hover:bg-[#1A1A1F] rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          title="Previous (←)"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Progress Dots */}
        <div className="flex items-center gap-1.5">
          {shots.map((_, i) => (
            <button
              key={i}
              onClick={() => useStoryboardStore.getState().setPresentationIndex(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === presentationIndex
                  ? 'bg-[#E8C547] w-6'
                  : i < presentationIndex
                  ? 'bg-[#E8C547]/50'
                  : 'bg-[#2A2A30] hover:bg-[#555]'
              }`}
            />
          ))}
        </div>

        <button
          onClick={nextShot}
          disabled={presentationIndex === shots.length - 1}
          className="p-3 text-[#8A8A8E] hover:text-[#F0EDE8] hover:bg-[#1A1A1F] rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          title="Next (→)"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* ── Bottom Progress Bar ── */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#1A1A1F] z-30">
        <div
          className="h-full bg-[#E8C547] transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
