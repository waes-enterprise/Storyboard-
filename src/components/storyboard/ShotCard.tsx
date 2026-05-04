'use client';

import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Shot } from '@/types/storyboard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GripVertical, Edit3, RefreshCw, Copy, Trash2, Upload, Code2, ClipboardCheck, Send, Loader2, X } from 'lucide-react';
import { useStoryboardStore } from '@/stores/storyboard';
import { SHOT_TYPES } from '@/types/storyboard';
import { toast } from 'sonner';

interface ShotCardProps {
  shot: Shot;
  onEdit: (shot: Shot) => void;
  onRegenerateImage: (shot: Shot) => void;
}

export const ShotCard = memo(function ShotCard({ shot, onEdit, onRegenerateImage }: ShotCardProps) {
  const [imageLoaded, setImageLoaded] = useState(!!shot.imageUrl);
  const [imageError, setImageError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editPromptValue, setEditPromptValue] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const removeShot = useStoryboardStore((s) => s.removeShot);
  const duplicateShot = useStoryboardStore((s) => s.duplicateShot);
  const uploadShotImage = useStoryboardStore((s) => s.uploadShotImage);
  const updateShot = useStoryboardStore((s) => s.updateShot);
  const regenerateImageWithPrompt = useStoryboardStore((s) => s.regenerateImageWithPrompt);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset image state when shot URL changes
  const prevUrlRef = useRef(shot.imageUrl);
  useEffect(() => {
    if (shot.imageUrl !== prevUrlRef.current) {
      setImageLoaded(!!shot.imageUrl);
      setImageError(false);
      setIsRegenerating(false);
      prevUrlRef.current = shot.imageUrl;
    }
  }, [shot.imageUrl]);

  // Focus prompt input when editing mode opens
  useEffect(() => {
    if (isEditingPrompt && promptInputRef.current) {
      promptInputRef.current.focus();
      promptInputRef.current.selectionStart = promptInputRef.current.value.length;
    }
  }, [isEditingPrompt]);

  // Flush storage on unmount
  useEffect(() => {
    return () => {
      useStoryboardStore.getState().flushStorage();
    };
  }, []);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setImageError(false);
    setImageLoaded(false);
    try {
      await uploadShotImage(shot.id, file);
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [shot.id, uploadShotImage]);

  const handleCopyPrompt = useCallback(() => {
    const imagePrompt = shot.frameDescription || shot.actionDescription || '';
    navigator.clipboard.writeText(imagePrompt);
    setCopied(true);
    toast.success('Prompt copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }, [shot.frameDescription, shot.actionDescription]);

  const handleOpenPromptEdit = useCallback(() => {
    setEditPromptValue(shot.frameDescription || shot.actionDescription || '');
    setIsEditingPrompt(true);
    setShowPrompt(false);
  }, [shot.frameDescription, shot.actionDescription]);

  const handlePromptEditSubmit = useCallback(() => {
    if (!editPromptValue.trim()) {
      toast.error('Prompt cannot be empty');
      return;
    }
    // Update the frame description in the store
    updateShot(shot.id, { frameDescription: editPromptValue.trim() });
    // Regenerate the image with the new prompt
    setIsRegenerating(true);
    setIsEditingPrompt(false);
    regenerateImageWithPrompt(shot.id, editPromptValue.trim());
    toast.success('Regenerating with new prompt...');
  }, [editPromptValue, shot.id, updateShot, regenerateImageWithPrompt]);

  const handlePromptEditCancel = useCallback(() => {
    setIsEditingPrompt(false);
    setEditPromptValue('');
  }, []);

  const handleDeleteShot = useCallback(() => {
    removeShot(shot.id);
    toast.success(`Shot ${shot.shotNumber} deleted`);
  }, [shot.id, shot.shotNumber, removeShot]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shot.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const shotTypeLabel = SHOT_TYPES.find((t) => t.value === shot.shotType)?.full || shot.shotType;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="shot-card bg-[#131316] border border-[#2A2A30] rounded-xl overflow-hidden group"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#2A2A30] bg-[#0E0E11]/50">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="text-[#555] hover:text-[#E8C547] cursor-grab active:cursor-grabbing transition-colors"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
          <Badge className="bg-[#E8C547] text-[#0A0A0C] text-[10px] font-bold px-2 py-0 h-5 rounded">
            {shot.shotNumber}
          </Badge>
          <Badge
            variant="outline"
            className="text-[9px] border-[#2A2A30] text-[#8A8A8E] px-1.5 py-0 h-5 rounded"
            title={shotTypeLabel}
          >
            {shot.shotType}
          </Badge>
          {isRegenerating && (
            <Loader2 className="w-3 h-3 animate-spin text-[#E8C547]" />
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Actions — always visible */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleUploadClick}
            disabled={isUploading}
            className="p-1 text-[#8A8A8E] hover:text-[#E8C547] hover:bg-[#1A1A1F] rounded transition-all disabled:opacity-50"
            title="Upload Image"
          >
            <Upload className={`w-3 h-3 ${isUploading ? 'animate-pulse' : ''}`} />
          </button>
          <button
            onClick={() => onEdit(shot)}
            className="p-1 text-[#8A8A8E] hover:text-[#E8C547] hover:bg-[#1A1A1F] rounded transition-all"
            title="Edit Shot Details"
          >
            <Edit3 className="w-3 h-3" />
          </button>
          <button
            onClick={() => onRegenerateImage(shot)}
            className="p-1 text-[#8A8A8E] hover:text-[#E8C547] hover:bg-[#1A1A1F] rounded transition-all"
            title="Regenerate Image"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={() => duplicateShot(shot.id)}
            className="p-1 text-[#8A8A8E] hover:text-[#E8C547] hover:bg-[#1A1A1F] rounded transition-all"
            title="Duplicate"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            onClick={() => setShowPrompt((p) => !p)}
            className={`p-1 rounded transition-all ${showPrompt ? 'text-[#E8C547] bg-[#E8C547]/10' : 'text-[#8A8A8E] hover:text-[#E8C547] hover:bg-[#1A1A1F]'}`}
            title="View Prompt"
          >
            <Code2 className="w-3 h-3" />
          </button>
          {/* Delete button — always visible */}
          <button
            onClick={handleDeleteShot}
            className="p-1 text-[#E84747]/60 hover:text-[#E84747] hover:bg-[#E84747]/10 rounded transition-all"
            title="Delete Shot"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Image Area */}
      <div className="relative aspect-video bg-[#0A0A0C] overflow-hidden">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0">
            <Skeleton className="w-full h-full bg-[#1A1A1F]" />
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2A2A30]">
              <div className="h-full bg-[#E8C547] progress-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}
        {shot.imageUrl && !imageError ? (
          <img
            src={shot.imageUrl}
            alt={`Shot ${shot.shotNumber}`}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(true);
            }}
          />
        ) : (
          imageError && (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#555] gap-2">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[10px]">Image unavailable</span>
            </div>
          )
        )}
        {!shot.imageUrl && !imageError && (
          <div className="w-full h-full flex flex-col items-center justify-center text-[#555] gap-2">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px]">Generating...</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-2">
        {/* Shot type + framing */}
        <div className="flex items-center gap-2 text-[9px] text-[#555] uppercase tracking-wider">
          <span>{shotTypeLabel}</span>
          <span className="text-[#2A2A30]">|</span>
          <span>Shot {shot.shotNumber}</span>
        </div>

        {/* Action */}
        <p className="text-[13px] text-[#F0EDE8] leading-relaxed">
          {shot.actionDescription}
        </p>

        {/* Camera Note */}
        {shot.cameraNote && (
          <p className="text-[11px] text-[#B8992E] italic leading-relaxed flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </span>
            {shot.cameraNote}
          </p>
        )}

        {/* Inline Prompt Edit Bar */}
        {isEditingPrompt ? (
          <div className="space-y-2 pt-1">
            <div className="relative">
              <textarea
                ref={promptInputRef}
                value={editPromptValue}
                onChange={(e) => setEditPromptValue(e.target.value)}
                className="w-full bg-[#0A0A0C] border border-[#E8C547]/50 text-[#F0EDE8] text-[11px] leading-relaxed rounded-lg p-2.5 pr-20 resize-none min-h-[80px] focus:outline-none focus:border-[#E8C547] placeholder:text-[#555]"
                placeholder="Edit the image prompt..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handlePromptEditSubmit();
                  }
                  if (e.key === 'Escape') {
                    handlePromptEditCancel();
                  }
                }}
              />
              <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
                <button
                  onClick={handlePromptEditCancel}
                  className="p-1 text-[#555] hover:text-[#8A8A8E] rounded transition-colors"
                  title="Cancel"
                >
                  <X className="w-3 h-3" />
                </button>
                <button
                  onClick={handlePromptEditSubmit}
                  disabled={!editPromptValue.trim() || isRegenerating}
                  className="flex items-center gap-1 px-2 py-1 bg-[#E8C547] hover:bg-[#D4B23E] text-[#0A0A0C] rounded-md text-[10px] font-semibold transition-all disabled:opacity-40"
                >
                  {isRegenerating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  Regenerate
                </button>
              </div>
            </div>
            <p className="text-[9px] text-[#555]">Ctrl+Enter to submit, Escape to cancel</p>
          </div>
        ) : (
          <>
            {/* Prompt action buttons */}
            <div className="flex gap-1.5">
              <button
                onClick={handleCopyPrompt}
                className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-md border transition-all flex-1 justify-center ${
                  copied
                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                    : 'bg-[#1A1A1F] border-[#2A2A30] text-[#8A8A8E] hover:border-[#E8C547]/50 hover:text-[#E8C547]'
                }`}
              >
                {copied ? (
                  <>
                    <ClipboardCheck className="w-3 h-3" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy Prompt
                  </>
                )}
              </button>
              <button
                onClick={handleOpenPromptEdit}
                className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-md border transition-all flex-1 justify-center bg-[#1A1A1F] border-[#2A2A30] text-[#8A8A8E] hover:border-[#E8C547]/50 hover:text-[#E8C547]"
              >
                <Edit3 className="w-3 h-3" />
                Edit & Regenerate
              </button>
            </div>

            {/* Prompt Viewer (expandable) */}
            {showPrompt && (
              <div className="pt-2 border-t border-[#2A2A30]">
                <p className="text-[10px] text-[#8A8A8E] leading-relaxed bg-[#0A0A0C] rounded-lg p-2.5 break-words select-all max-h-32 overflow-y-auto">
                  {shot.frameDescription || shot.actionDescription}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
