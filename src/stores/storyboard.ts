import { create } from 'zustand';
import type { Shot, Storyboard } from '@/types/storyboard';

const STORAGE_KEY = 'storyboard-ai-session';

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

  setShots: (shots) => {
    set({ shots });
    saveToStorage(get());
  },

  addShot: (shot) => {
    set((state) => ({ shots: [...state.shots, shot] }));
    saveToStorage(get());
  },

  updateShot: (id, updates) => {
    set((state) => ({
      shots: state.shots.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
    saveToStorage(get());
  },

  removeShot: (id) => {
    set((state) => ({
      shots: state.shots
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, shotNumber: i + 1, order: i })),
    }));
    saveToStorage(get());
  },

  duplicateShot: (id) => {
    const state = get();
    const shot = state.shots.find((s) => s.id === id);
    if (!shot) return;
    const idx = state.shots.indexOf(shot);
    const newShot: Shot = {
      ...shot,
      id: crypto.randomUUID(),
      shotNumber: idx + 2,
      imageUrl: '',
      order: idx + 1,
    };
    const newShots = [...state.shots];
    newShots.splice(idx + 1, 0, newShot);
    const renumbered = newShots.map((s, i) => ({ ...s, shotNumber: i + 1, order: i }));
    set({ shots: renumbered });
    saveToStorage(get());
  },

  reorderShots: (activeId, overId) => {
    set((state) => {
      const oldIndex = state.shots.findIndex((s) => s.id === activeId);
      const newIndex = state.shots.findIndex((s) => s.id === overId);
      if (oldIndex === -1 || newIndex === -1) return state;
      const newShots = [...state.shots];
      const [removed] = newShots.splice(oldIndex, 1);
      newShots.splice(newIndex, 0, removed);
      const renumbered = newShots.map((s, i) => ({ ...s, shotNumber: i + 1, order: i }));
      return { shots: renumbered };
    });
    saveToStorage(get());
  },

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
    const encodedPrompt = encodeURIComponent(`${prompt}, cinematic storyboard pencil sketch black and white film grain`);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=640&height=360&nologo=true&seed=${seed}`;
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
    set({
      shots: [],
      currentStoryboardId: null,
      title: '',
      scene: '',
      style: 'Cinematic',
      shotCount: 6,
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
}));
