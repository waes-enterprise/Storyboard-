'use client';

import { useEffect, useRef, useCallback } from 'react';
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
import { EditModal } from './EditModal';
import type { Shot } from '@/types/storyboard';
import { Clapperboard, Loader2, ImageIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export function ShotCanvas() {
  const {
    shots,
    isLoadingImages,
    imageLoadingProgress,
    reorderShots,
    updateShotImageUrl,
    setIsLoadingImages,
    setImageLoadingProgress,
    editingShot,
    isEditModalOpen,
    setEditingShot,
    setIsEditModalOpen,
  } = useStoryboardStore();

  const isImageLoadingRef = useRef(false);

  // Sequential image loading
  const loadImagesSequentially = useCallback(async () => {
    if (isImageLoadingRef.current) return;
    const shotsToLoad = shots.filter((s) => !s.imageUrl && s.frameDescription);
    if (shotsToLoad.length === 0) return;

    isImageLoadingRef.current = true;
    setIsLoadingImages(true);
    setImageLoadingProgress(0);

    for (let i = 0; i < shotsToLoad.length; i++) {
      const shot = shotsToLoad[i];
      const seed = Date.now() + i * 1000 + Math.floor(Math.random() * 1000);
      const prompt = shot.frameDescription || shot.actionDescription;
      const encodedPrompt = encodeURIComponent(
        `${prompt}, cinematic storyboard pencil sketch black and white film grain`
      );
      const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=640&height=360&nologo=true&seed=${seed}`;

      // Pre-load image
      try {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            updateShotImageUrl(shot.id, url);
            resolve();
          };
          img.onerror = () => {
            // Still set the URL even if pre-load fails - the img tag will handle it
            updateShotImageUrl(shot.id, url);
            resolve();
          };
          img.src = url;
          // Timeout after 30s
          setTimeout(() => {
            updateShotImageUrl(shot.id, url);
            resolve();
          }, 30000);
        });
      } catch {
        updateShotImageUrl(shot.id, url);
      }

      setImageLoadingProgress(((i + 1) / shotsToLoad.length) * 100);
    }

    setIsLoadingImages(false);
    isImageLoadingRef.current = false;
  }, [shots, updateShotImageUrl, setIsLoadingImages, setImageLoadingProgress]);

  // Trigger image loading when shots change
  useEffect(() => {
    if (shots.length > 0) {
      const shotsNeedingImages = shots.filter((s) => !s.imageUrl && s.frameDescription);
      if (shotsNeedingImages.length > 0) {
        // Small delay to let cards render first
        const timer = setTimeout(loadImagesSequentially, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [shots.length, loadImagesSequentially, shots]);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderShots(active.id as string, over.id as string);
    }
  };

  const handleEdit = (shot: Shot) => {
    setEditingShot(shot);
    setIsEditModalOpen(true);
  };

  const handleRegenerateImage = (shot: Shot) => {
    useStoryboardStore.getState().regenerateImageForShot(shot.id);
  };

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
    <div className="flex-1 overflow-y-auto p-6">
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
            onClick={() => {
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
              useStoryboardStore.getState().addShot(newShot);
              // Open edit modal for the new shot
              setEditingShot(newShot);
              setIsEditModalOpen(true);
            }}
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
          <SortableContext items={shots.map((s) => s.id)} strategy={rectSortingStrategy}>
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
  );
}
