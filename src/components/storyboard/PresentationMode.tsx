'use client';

import { useEffect, useCallback } from 'react';
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

  const currentShot = shots[presentationIndex];
  const shotTypeLabel = SHOT_TYPES.find((t) => t.value === currentShot?.shotType)?.full || currentShot?.shotType;

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

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 z-10">
        <div className="flex items-center gap-4">
          <h2 className="text-[#F0EDE8] font-heading text-lg truncate max-w-md">
            {title || 'Untitled Storyboard'}
          </h2>
          <span className="text-xs text-[#8A8A8E] bg-[#1A1A1F] px-2.5 py-1 rounded-full border border-[#2A2A30]">
            {style}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPresentationMode(false)}
            className="p-2 text-[#8A8A8E] hover:text-[#F0EDE8] hover:bg-[#1A1A1F] rounded-lg transition-all"
            title="Exit (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Shot Counter */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 text-sm text-[#555] font-mono">
        {presentationIndex + 1} / {shots.length}
      </div>

      {/* Main Shot Display */}
      <div className="flex-1 flex items-center justify-center w-full px-8 py-20">
        <div className="w-full max-w-5xl space-y-6">
          {/* Image */}
          <div className="relative aspect-video bg-[#0A0A0C] rounded-xl overflow-hidden border border-[#2A2A30] shadow-2xl">
            {currentShot.imageUrl ? (
              <img
                src={currentShot.imageUrl}
                alt={`Shot ${currentShot.shotNumber}`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[#555] gap-3">
                <Maximize2 className="w-12 h-12" />
                <span className="text-sm">No image available</span>
              </div>
            )}
            {/* Shot Number Overlay */}
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <span className="bg-[#E8C547] text-[#0A0A0C] text-sm font-bold px-3 py-1 rounded-md">
                SHOT {currentShot.shotNumber}
              </span>
              <span className="bg-[#1A1A1F]/90 text-[#8A8A8E] text-xs px-2.5 py-1 rounded-md border border-[#2A2A30]">
                {shotTypeLabel}
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <p className="text-xl text-[#F0EDE8] leading-relaxed font-heading">
              {currentShot.actionDescription}
            </p>
            {currentShot.cameraNote && (
              <p className="text-sm text-[#B8992E] italic leading-relaxed">
                🎬 {currentShot.cameraNote}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-6 py-4 z-10">
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
    </div>
  );
}
