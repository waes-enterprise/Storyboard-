'use client';

import { useEffect } from 'react';
import { useStoryboardStore } from '@/stores/storyboard';

interface KeyboardShortcutsProps {
  onNewStoryboard?: () => void;
}

export function KeyboardShortcuts({ onNewStoryboard }: KeyboardShortcutsProps) {
  const {
    isPresentationMode,
    canUndo,
    canRedo,
    undo,
    redo,
    shots,
    editingShot,
    isEditModalOpen,
    setPresentationMode,
    removeShot,
    clearShots,
    setIsEditModalOpen,
    setEditingShot,
    saveToServer,
  } = useStoryboardStore();

  useEffect(() => {
    if (isPresentationMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs, textareas, or content-editable elements
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (isTyping) return;

      const mod = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd + Z = Undo
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
        return;
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = Redo
      if (
        ((mod && e.shiftKey && e.key === 'z') || (mod && e.key === 'y'))
      ) {
        e.preventDefault();
        if (canRedo) redo();
        return;
      }

      // Ctrl/Cmd + S = Save storyboard
      if (mod && e.key === 's') {
        e.preventDefault();
        if (shots.length > 0) {
          saveToServer().then(() => {
            // saveToServer shows its own feedback
          }).catch(() => {});
        }
        return;
      }

      // Ctrl/Cmd + N = New / Clear → navigate to landing page
      if (mod && e.key === 'n') {
        e.preventDefault();
        if (onNewStoryboard) {
          onNewStoryboard();
        } else {
          clearShots();
        }
        return;
      }

      // Delete = Remove currently editing shot
      if (e.key === 'Delete' && editingShot) {
        e.preventDefault();
        const shotId = editingShot.id;
        setIsEditModalOpen(false);
        setEditingShot(null);
        removeShot(shotId);
        return;
      }

      // Escape = Close edit modal
      if (e.key === 'Escape' && isEditModalOpen) {
        e.preventDefault();
        setIsEditModalOpen(false);
        setEditingShot(null);
        return;
      }

      // Ctrl/Cmd + P = Presentation mode
      if (mod && e.key === 'p') {
        e.preventDefault();
        if (shots.length > 0) setPresentationMode(true);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isPresentationMode,
    canUndo,
    canRedo,
    undo,
    redo,
    shots,
    editingShot,
    isEditModalOpen,
    setPresentationMode,
    removeShot,
    clearShots,
    setIsEditModalOpen,
    setEditingShot,
    saveToServer,
    onNewStoryboard,
  ]);

  return null; // No UI — purely handles keyboard events
}
