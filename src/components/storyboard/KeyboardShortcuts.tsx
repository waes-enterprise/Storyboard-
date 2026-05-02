'use client';

import { useEffect } from 'react';
import { useStoryboardStore } from '@/stores/storyboard';

export function KeyboardShortcuts() {
  const {
    isPresentationMode,
    canUndo,
    canRedo,
    undo,
    redo,
    shots,
    setPresentationMode,
    removeShot,
    duplicateShot,
  } = useStoryboardStore();

  useEffect(() => {
    if (isPresentationMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs/textareas
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isTyping) return;

      // Ctrl/Cmd + Z = Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) undo();
      }
      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = Redo
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')
      ) {
        e.preventDefault();
        if (canRedo()) redo();
      }
      // Ctrl/Cmd + P = Presentation mode
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        if (shots.length > 0) setPresentationMode(true);
      }
      // Ctrl/Cmd + D = Duplicate last selected (no-op without selection — just show hint)
      // Delete key — handled by individual card focus if needed
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPresentationMode, canUndo, canRedo, undo, redo, shots, setPresentationMode]);

  return null; // No UI — purely handles keyboard events
}
