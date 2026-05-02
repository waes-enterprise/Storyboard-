import { create } from 'zustand';
import type { Shot, Storyboard } from '@/types/storyboard';

const STORAGE_KEY = 'storyboard-ai-session';
const MAX_UNDO = 50;

function loadFromStorage(): Storyboard | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return null;
}

function saveToStorage(state: StoryboardState) {
  if (typeof window === 'undefined') return;
  try {
    const data: Storyboard = {
      id: state.currentStoryboardId,
      title: state.title,
      scene: state.scene,
      style: state.style,
      shotCount: state.shotCount,
      shots: state.shots,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

interface StoryboardState {
  shots: Shot[];
  currentStoryboardId: string | null;
  title: string;
  scene: string;
  style: string;
  shotCount: number;
  isGenerating: boolean;
  isLoadingImages: boolean;
  imageLoadingProgress: number;
  savedStoryboards: Storyboard[];
  editingShot: Shot | null;
  isEditModalOpen: boolean;
  isPresentationMode: boolean;
  presentationIndex: number;

  // Undo/Redo
  history: Shot[][];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Actions
  setShots: (shots: Shot[]) => void;
  addShot: (shot: Shot) => void;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  removeShot: (id: string) => void;
  duplicateShot: (id: string) => void;
  reorderShots: (activeId: string, overId: string) => void;
  setCurrentStoryboardId: (id: string | null) => void;
  setTitle: (title: string) => void;
  setScene: (scene: string) => void;
  setStyle: (style: string) => void;
  setShotCount: (count: number) => void;
  setIsGenerating: (val: boolean) => void;
  setIsLoadingImages: (val: boolean) => void;
  setImageLoadingProgress: (val: number) => void;
  setSavedStoryboards: (storyboards: Storyboard[]) => void;
  setEditingShot: (shot: Shot | null) => void;
  setIsEditModalOpen: (val: boolean) => void;
  updateShotImageUrl: (id: string, url: string) => void;
  regenerateImageForShot: (id: string) => void;
  loadStoryboard: (storyboard: Storyboard) => void;
  clearShots: () => void;
  hydrate: () => void;
  setPresentationMode: (val: boolean) => void;
  setPresentationIndex: (idx: number) => void;
  nextShot: () => void;
  prevShot: () => void;
  saveToServer: () => Promise<void>;
}

/**
 * Compute canUndo / canRedo booleans from history and index.
 */
function computeCanUndoRedo(history: Shot[][], historyIndex: number) {
  return {
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
  };
}

/**
 * Trim history to MAX_UNDO entries (keeps the most recent).
 */
function capHistory(history: Shot[][]): Shot[][] {
  if (history.length > MAX_UNDO) {
    return history.slice(history.length - MAX_UNDO);
  }
  return history;
}

export const useStoryboardStore = create<StoryboardState>((set, get) => ({
  shots: [],
  currentStoryboardId: null,
  title: '',
  scene: '',
  style: 'Cinematic',
  shotCount: 6,
  isGenerating: false,
  isLoadingImages: false,
  imageLoadingProgress: 0,
  savedStoryboards: [],
  editingShot: null,
  isEditModalOpen: false,
  isPresentationMode: false,
  presentationIndex: 0,
  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,

  // ---------------------------------------------------------------------------
  // Private: snapshot current shots into history (truncate any redo tail)
  // ---------------------------------------------------------------------------
  _pushHistory: () => {
    const { shots, history, historyIndex } = get();
    // Truncate any future entries (discard redo states)
    let newHistory = history.slice(0, historyIndex + 1);
    // Push deep clone of current shots
    newHistory.push(JSON.parse(JSON.stringify(shots)));
    // Cap
    newHistory = capHistory(newHistory);
    const newIndex = newHistory.length - 1;
    set({
      history: newHistory,
      historyIndex: newIndex,
      ...computeCanUndoRedo(newHistory, newIndex),
    });
  },

  // ---------------------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------------------
  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const shots = JSON.parse(JSON.stringify(history[newIndex]));
    set({
      shots,
      historyIndex: newIndex,
      ...computeCanUndoRedo(history, newIndex),
    });
    saveToStorage(get());
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const shots = JSON.parse(JSON.stringify(history[newIndex]));
    set({
      shots,
      historyIndex: newIndex,
      ...computeCanUndoRedo(history, newIndex),
    });
    saveToStorage(get());
  },

  // ---------------------------------------------------------------------------
  // Shot mutations (each calls _pushHistory BEFORE modifying)
  // ---------------------------------------------------------------------------

  setShots: (newShots) => {
    get()._pushHistory();
    // Push new state into history
    set((state) => {
      let newHistory = [...state.history, newShots];
      newHistory = capHistory(newHistory);
      const idx = newHistory.length - 1;
      return { shots: newShots, history: newHistory, historyIndex: idx, ...computeCanUndoRedo(newHistory, idx) };
    });
    saveToStorage(get());
  },

  addShot: (shot) => {
    get()._pushHistory();
    set((state) => {
      const newShots = [...state.shots, shot];
      let newHistory = [...state.history, newShots];
      newHistory = capHistory(newHistory);
      const idx = newHistory.length - 1;
      return { shots: newShots, history: newHistory, historyIndex: idx, ...computeCanUndoRedo(newHistory, idx) };
    });
    saveToStorage(get());
  },

  updateShot: (id, updates) => {
    get()._pushHistory();
    set((state) => {
      const newShots = state.shots.map((s) => (s.id === id ? { ...s, ...updates } : s));
      let newHistory = [...state.history, newShots];
      newHistory = capHistory(newHistory);
      const idx = newHistory.length - 1;
      return { shots: newShots, history: newHistory, historyIndex: idx, ...computeCanUndoRedo(newHistory, idx) };
    });
    saveToStorage(get());
  },

  removeShot: (id) => {
    get()._pushHistory();
    set((state) => {
      const newShots = state.shots
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, shotNumber: i + 1, order: i }));
      let newHistory = [...state.history, newShots];
      newHistory = capHistory(newHistory);
      const idx = newHistory.length - 1;
      return { shots: newShots, history: newHistory, historyIndex: idx, ...computeCanUndoRedo(newHistory, idx) };
    });
    saveToStorage(get());
  },

  duplicateShot: (id) => {
    const shot = get().shots.find((s) => s.id === id);
    if (!shot) return;

    get()._pushHistory();
    const state = get(); // re-read after _pushHistory updated history
    const idx = state.shots.indexOf(shot);
    const newShot: Shot = {
      ...shot,
      id: crypto.randomUUID(),
      shotNumber: idx + 2,
      imageUrl: '',
      order: idx + 1,
    };
    const copied = [...state.shots];
    copied.splice(idx + 1, 0, newShot);
    const newShots = copied.map((s, i) => ({ ...s, shotNumber: i + 1, order: i }));
    let newHistory = [...state.history, newShots];
    newHistory = capHistory(newHistory);
    const newIdx = newHistory.length - 1;
    set({ shots: newShots, history: newHistory, historyIndex: newIdx, ...computeCanUndoRedo(newHistory, newIdx) });
    saveToStorage(get());
  },

  reorderShots: (activeId, overId) => {
    get()._pushHistory();
    set((state) => {
      const oldIndex = state.shots.findIndex((s) => s.id === activeId);
      const newIndex = state.shots.findIndex((s) => s.id === overId);
      if (oldIndex === -1 || newIndex === -1) return state;
      const arr = [...state.shots];
      const [removed] = arr.splice(oldIndex, 1);
      arr.splice(newIndex, 0, removed);
      const newShots = arr.map((s, i) => ({ ...s, shotNumber: i + 1, order: i }));
      let newHistory = [...state.history, newShots];
      newHistory = capHistory(newHistory);
      const idx = newHistory.length - 1;
      return { shots: newShots, history: newHistory, historyIndex: idx, ...computeCanUndoRedo(newHistory, idx) };
    });
    saveToStorage(get());
  },

  // ---------------------------------------------------------------------------
  // Non-shot mutations (no history push)
  // ---------------------------------------------------------------------------

  setCurrentStoryboardId: (id) => {
    set({ currentStoryboardId: id });
    saveToStorage(get());
  },

  setTitle: (title) => {
    set({ title });
    saveToStorage(get());
  },

  setScene: (scene) => {
    set({ scene });
    saveToStorage(get());
  },

  setStyle: (style) => {
    set({ style });
    saveToStorage(get());
  },

  setShotCount: (count) => {
    set({ shotCount: count });
  },

  setIsGenerating: (val) => set({ isGenerating: val }),

  setIsLoadingImages: (val) => set({ isLoadingImages: val }),

  setImageLoadingProgress: (val) => set({ imageLoadingProgress: val }),

  setSavedStoryboards: (storyboards) => set({ savedStoryboards: storyboards }),

  setEditingShot: (shot) => set({ editingShot: shot }),

  setIsEditModalOpen: (val) => set({ isEditModalOpen: val }),

  updateShotImageUrl: (id, url) => {
    set((state) => ({
      shots: state.shots.map((s) => (s.id === id ? { ...s, imageUrl: url } : s)),
    }));
    saveToStorage(get());
  },

  regenerateImageForShot: (id) => {
    const state = get();
    const shot = state.shots.find((s) => s.id === id);
    if (!shot) return;
    const seed = Date.now() + Math.floor(Math.random() * 10000);
    const prompt = shot.frameDescription || shot.actionDescription;
    const encodedPrompt = encodeURIComponent(`${prompt}, raw ungraded footage, natural sunlight only, no color grading no filters no CGI no VFX no animation no AI enhancement, no text no watermarks no overlays, handheld documentary camera style, real photography, photorealistic, natural lens, no zoom, candid moment captured on set`);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=960&height=540&nologo=true&seed=${seed}&model=flux`;
    // Clear image first to show loading state
    set((s) => ({
      shots: s.shots.map((sh) => (sh.id === id ? { ...sh, imageUrl: '' } : sh)),
    }));
    // Set new URL
    setTimeout(() => {
      get().updateShotImageUrl(id, url);
    }, 100);
  },

  loadStoryboard: (storyboard) => {
    set({
      currentStoryboardId: storyboard.id || null,
      title: storyboard.title,
      scene: storyboard.scene,
      style: storyboard.style,
      shotCount: storyboard.shotCount,
      shots: storyboard.shots,
    });
    saveToStorage(get());
  },

  clearShots: () => {
    const state = get();
    get()._pushHistory();
    const afterPush = get(); // re-read after _pushHistory
    const newShots: Shot[] = [];
    let newHistory = [...afterPush.history, newShots];
    newHistory = capHistory(newHistory);
    const idx = newHistory.length - 1;
    set({
      shots: [],
      currentStoryboardId: null,
      title: '',
      scene: '',
      style: 'Cinematic',
      shotCount: 6,
      history: newHistory,
      historyIndex: idx,
      ...computeCanUndoRedo(newHistory, idx),
    });
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  },

  hydrate: () => {
    const saved = loadFromStorage();
    if (saved) {
      set({
        currentStoryboardId: saved.id || null,
        title: saved.title || '',
        scene: saved.scene || '',
        style: saved.style || 'Cinematic',
        shotCount: saved.shotCount || 6,
        shots: saved.shots || [],
      });
    }
  },

  setPresentationMode: (val: boolean) => set({ isPresentationMode: val, presentationIndex: 0 }),
  setPresentationIndex: (idx: number) => set({ presentationIndex: idx }),
  nextShot: () => {
    const { shots, presentationIndex } = get();
    if (presentationIndex < shots.length - 1) set({ presentationIndex: presentationIndex + 1 });
  },
  prevShot: () => {
    const { presentationIndex } = get();
    if (presentationIndex > 0) set({ presentationIndex: presentationIndex - 1 });
  },

  // ---------------------------------------------------------------------------
  // Save to server (used by Ctrl+S keyboard shortcut)
  // ---------------------------------------------------------------------------
  saveToServer: async () => {
    const state = get();
    if (state.shots.length === 0) return;

    const payload = {
      title: state.title || 'Untitled Storyboard',
      scene: state.scene,
      style: state.style,
      shotCount: state.shots.length,
      shots: state.shots,
    };

    try {
      if (state.currentStoryboardId) {
        await fetch(`/api/storyboards/${state.currentStoryboardId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const res = await fetch('/api/storyboards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          get().setCurrentStoryboardId(data.id);
        }
      }
    } catch {
      // Silently fail — toast is handled by the caller if needed
    }
  },
}));
