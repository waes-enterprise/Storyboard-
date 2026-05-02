'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useStoryboardStore } from '@/stores/storyboard';
import { ShotCard } from './ShotCard';
import type { Shot } from '@/types/storyboard';
import { Clapperboard, Loader2, ImageIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

// Dynamic imports for code splitting — loaded on demand
const EditModal = dynamic(() => import('./EditModal').then((m) => ({ default: m.EditModal })), {
  ssr: false,
  loading: () => null,
});

const PresentationMode = dynamic(() => import('./PresentationMode').then((m) => ({ default: m.PresentationMode })), {
  ssr: false,
  loading: () => null,
});

const IMAGE_STYLE_SUFFIX = ', raw ungraded footage, natural sunlight only, no color grading no filters no CGI no VFX no animation no AI enhancement, no text no watermarks no overlays, handheld documentary camera style, real photography, photorealistic, natural lens, no zoom, candid moment captured on set';

export function ShotCanvas() {
  const shots = useStoryboardStore((s) => s.shots);
  const isLoadingImages = useStoryboardStore((s) => s.isLoadingImages);
  const imageLoadingProgress = useStoryboardStore((s) => s.imageLoadingProgress);
  const reorderShots = useStoryboardStore((s) => s.reorderShots);
  const updateShotImageUrl = useStoryboardStore((s) => s.updateShotImageUrl);
  const setIsLoadingImages = useStoryboardStore((s) => s.setIsLoadingImages);
  const setImageLoadingProgress = useStoryboardStore((s) => s.setImageLoadingProgress);
  const editingShot = useStoryboardStore((s) => s.editingShot);
  const isEditModalOpen = useStoryboardStore((s) => s.isEditModalOpen);
  const setEditingShot = useStoryboardStore((s) => s.setEditingShot);
  const setIsEditModalOpen = useStoryboardStore((s) => s.setIsEditModalOpen);
  const isPresentationMode = useStoryboardStore((s) => s.isPresentationMode);
  const addShot = useStoryboardStore((s) => s.addShot);
  const regenerateImageForShot = useStoryboardStore((s) => s.regenerateImageForShot);
  const flushStorage = useStoryboardStore((s) => s.flushStorage);

  const isImageLoadingRef = useRef(false);

  // Memoize shot IDs for SortableContext to prevent unnecessary recalcs
  const shotIds = useMemo(() => shots.map((s) => s.id), [shots]);

  // Track which shots need images (memoized)
  const shotsNeedingImages = useMemo(
    () => shots.filter((s) => !s.imageUrl && s.frameDescription),
    [shots]
  );

  // Flush storage when images finish loading
  useEffect(() => {
    if (!isLoadingImages && isImageLoadingRef.current) {
      flushStorage();
    }
  }, [isLoadingImages, flushStorage]);

  // Parallel image loading — higher concurrency, lower timeout, no delay
  const loadImagesInParallel = useCallback(async (shotsToLoad: Shot[]) => {
    if (isImageLoadingRef.current || shotsToLoad.length === 0) return;

    isImageLoadingRef.current = true;
    setIsLoadingImages(true);
    setImageLoadingProgress(0);

    const CONCURRENCY = 6;
    const TIMEOUT_MS = 12000;
    let completed = 0;
    const total = shotsToLoad.length;

    const loadImage = (shot: Shot, index: number): Promise<void> => {
      return new Promise<void>((resolve) => {
        const seed = Date.now() + index * 7919 + Math.floor(Math.random() * 1000);
        const prompt = shot.frameDescription || shot.actionDescription;
        const encodedPrompt = encodeURIComponent(prompt + IMAGE_STYLE_SUFFIX);
        const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=960&height=540&nologo=true&seed=${seed}&model=flux`;

        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          completed++;
          // Batch progress updates via rAF
          requestAnimationFrame(() => {
            setImageLoadingProgress((completed / total) * 100);
          });
          resolve();
        };

        const img = new Image();
        img.onload = () => {
          updateShotImageUrl(shot.id, url);
          done();
        };
        img.onerror = () => {
          updateShotImageUrl(shot.id, url);
          done();
        };
        img.src = url;
        setTimeout(() => {
          updateShotImageUrl(shot.id, url);
          done();
        }, TIMEOUT_MS);
      });
    };

    // Process all in parallel up to CONCURRENCY
    for (let i = 0; i < shotsToLoad.length; i += CONCURRENCY) {
      const batch = shotsToLoad.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map((shot, batchIdx) => loadImage(shot, i + batchIdx)));
    }

    setIsLoadingImages(false);
    isImageLoadingRef.current = false;
  }, [updateShotImageUrl, setIsLoadingImages, setImageLoadingProgress]);

  // Trigger image loading immediately when shots change (no 500ms delay)
  useEffect(() => {
    if (shotsNeedingImages.length > 0) {
      // Use rAF to avoid blocking render
      const raf = requestAnimationFrame(() => loadImagesInParallel(shotsNeedingImages));
      return () => cancelAnimationFrame(raf);
    }
  }, [shotsNeedingImages, loadImagesInParallel]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderShots(active.id as string, over.id as string);
    }
  }, [reorderShots]);

  const handleEdit = useCallback((shot: Shot) => {
    setEditingShot(shot);
    setIsEditModalOpen(true);
  }, [setEditingShot, setIsEditModalOpen]);

  const handleRegenerateImage = useCallback((shot: Shot) => {
    regenerateImageForShot(shot.id);
  }, [regenerateImageForShot]);

  const handleAddShot = useCallback(() => {
    const newShot: Shot = {
      id: crypto.randomUUID(),
      shotNumber: shots.length + 1,
      shotType: 'MS',
      actionDescription: 'New shot description...',
      cameraNote: '',
      frameDescription: '',
      imageUrl: '',
      order: shots.length,
    };
    addShot(newShot);
    setEditingShot(newShot);
    setIsEditModalOpen(true);
  }, [shots.length, addShot, setEditingShot, setIsEditModalOpen]);

  // Empty state
  if (shots.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-24 h-24 mx-auto rounded-2xl bg-[#1A1A1F] border border-[#2A2A30] flex items-center justify-center">
            <Clapperboard className="w-10 h-10 text-[#555]" />
          </div>
          <div>
            <h2 className="font-heading text-2xl text-[#F0EDE8] mb-2">No Shots Yet</h2>
            <p className="text-sm text-[#8A8A8E] leading-relaxed">
              Describe your scene in the sidebar and click
              <span className="text-[#E8C547] font-medium"> Generate Storyboard </span>
              to create your cinematic shot list powered by Claude AI.
            </p>
          </div>
          <div className="flex items-center justify-center gap-6 text-xs text-[#555]">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              <span>AI Images</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              <span>Drag to Reorder</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Easy Export</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
      {/* Status bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-xl text-[#F0EDE8]">Shot Canvas</h2>
          <span className="text-xs text-[#8A8A8E] bg-[#1A1A1F] px-2.5 py-1 rounded-full border border-[#2A2A30]">
            {shots.length} shot{shots.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleAddShot}
            size="sm"
            className="bg-[#E8C547]/10 border-[#E8C547]/30 text-[#E8C547] hover:bg-[#E8C547]/20 hover:border-[#E8C547] h-8 text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Shot
          </Button>
          {isLoadingImages && (
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-[#E8C547]" />
              <span className="text-xs text-[#8A8A8E]">
                Generating images... {Math.round(imageLoadingProgress)}%
              </span>
              <div className="w-32">
                <Progress value={imageLoadingProgress} className="h-1.5 bg-[#2A2A30]" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Shot Grid */}
      <div id="shot-canvas">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={shotIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shots.map((shot) => (
                <ShotCard
                  key={shot.id}
                  shot={shot}
                  onEdit={handleEdit}
                  onRegenerateImage={handleRegenerateImage}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            <div className="drag-overlay bg-[#131316] border-2 border-[#E8C547] rounded-xl p-4 opacity-90">
              <p className="text-sm text-[#E8C547]">Dragging shot...</p>
            </div>
          </DragOverlay>
        </DndContext>
      </div>

      {/* Edit Modal */}
      <EditModal
        shot={editingShot}
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
      />
    </div>

      {/* Fullscreen Presentation Mode */}
      {isPresentationMode && <PresentationMode />}
    </>
  );
}
