'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStoryboardStore } from '@/stores/storyboard';
import { VISUAL_STYLES } from '@/types/storyboard';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Clapperboard,
  Save,
  Trash2,
  FolderOpen,
  Sparkles,
  Loader2,
  Film,
  Maximize,
  Undo2,
  Redo2,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Storyboard } from '@/types/storyboard';
import { ExportDropdown } from './ExportDropdown';

interface SidebarProps {
  onNewStoryboard?: () => void;
  onOpenDashboard?: () => void;
}

export function Sidebar({ onNewStoryboard, onOpenDashboard }: SidebarProps) {
  const [isLoadingStoryboards, setIsLoadingStoryboards] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedList, setSavedList] = useState<Storyboard[]>([]);

  const {
    scene,
    style,
    shotCount,
    title,
    shots,
    currentStoryboardId,
    isGenerating,
    setScene,
    setStyle,
    setShotCount,
    setTitle,
    setShots,
    setIsGenerating,
    loadStoryboard,
    clearShots,
    setSavedStoryboards,
    canUndo,
    canRedo,
    undo,
    redo,
    setPresentationMode,
  } = useStoryboardStore();

  // Load saved storyboards
  const loadSavedStoryboards = useCallback(async () => {
    setIsLoadingStoryboards(true);
    try {
      const res = await fetch('/api/storyboards');
      if (res.ok) {
        const data = await res.json();
        setSavedList(data);
        setSavedStoryboards(data);
      }
    } catch {
      toast.error('Failed to load saved storyboards');
    } finally {
      setIsLoadingStoryboards(false);
    }
  }, [setSavedStoryboards]);

  useEffect(() => {
    loadSavedStoryboards();
  }, [loadSavedStoryboards]);

  const handleGenerate = async () => {
    if (!scene.trim()) {
      toast.error('Please describe your scene');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene: scene.trim(),
          style,
          shotCount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to generate storyboard');
        return;
      }

      clearShots();
      setShots(data.shots);
      if (!title) {
        const autoTitle = scene.trim().slice(0, 50) + (scene.trim().length > 50 ? '...' : '');
        setTitle(autoTitle);
      }
      toast.success(`Director planned ${data.shots.length} shots!`);
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (shots.length === 0) {
      toast.error('No shots to save');
      return;
    }
    setIsSaving(true);
    try {
      if (currentStoryboardId) {
        const res = await fetch(`/api/storyboards/${currentStoryboardId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title || 'Untitled Storyboard',
            scene,
            style,
            shotCount: shots.length,
            shots,
          }),
        });
        if (res.ok) {
          toast.success('Storyboard updated!');
          loadSavedStoryboards();
        } else {
          toast.error('Failed to update storyboard');
        }
      } else {
        const res = await fetch('/api/storyboards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title || 'Untitled Storyboard',
            scene,
            style,
            shotCount: shots.length,
            shots,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          useStoryboardStore.getState().setCurrentStoryboardId(data.id);
          toast.success('Storyboard saved!');
          loadSavedStoryboards();
        } else {
          toast.error('Failed to save storyboard');
        }
      }
    } catch {
      toast.error('Failed to save storyboard');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/storyboards/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Storyboard deleted');
        loadSavedStoryboards();
        if (currentStoryboardId === id) {
          clearShots();
        }
      }
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleLoad = async (id: string) => {
    try {
      const res = await fetch(`/api/storyboards/${id}`);
      if (res.ok) {
        const data = await res.json();
        loadStoryboard(data);
        toast.success(`Loaded "${data.title}"`);
      }
    } catch {
      toast.error('Failed to load storyboard');
    }
  };

  const handleNew = () => {
    if (onNewStoryboard) {
      onNewStoryboard();
    } else {
      clearShots();
      toast.success('Cleared canvas');
    }
  };

  return (
    <aside className="w-full md:w-[340px] flex-shrink-0 bg-[#0E0E11] border-r border-[#2A2A30] flex flex-col h-screen overflow-hidden">
      {/* Brand */}
      <div className="p-4 border-b border-[#2A2A30]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#E8C547] flex items-center justify-center">
              <Clapperboard className="w-4 h-4 text-[#0A0A0C]" />
            </div>
            <div>
              <h1 className="font-heading text-base text-[#F0EDE8] leading-tight">Storyboard AI</h1>
              <p className="text-[9px] text-[#555] tracking-[0.15em] uppercase">v2 Director</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenDashboard}
              className="flex items-center gap-1 text-[10px] text-[#8A8A8E] hover:text-[#E8C547] transition-colors"
              title="Workspaces"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Workspaces
            </button>
            <span className="text-[#2A2A30]">|</span>
            <button
              onClick={handleNew}
              className="flex items-center gap-1 text-[10px] text-[#8A8A8E] hover:text-[#E8C547] transition-colors"
              title="New Storyboard"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              New
            </button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-[10px] text-[#555] uppercase tracking-[0.15em] font-medium">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Storyboard"
              className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] placeholder:text-[#444] text-xs h-9"
            />
          </div>

          {/* Scene Description */}
          <div className="space-y-1.5">
            <Label className="text-[10px] text-[#555] uppercase tracking-[0.15em] font-medium">Scene Description</Label>
            <Textarea
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              placeholder="Describe your scene..."
              className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] placeholder:text-[#444] text-xs min-h-[100px] resize-none"
            />
          </div>

          {/* Visual Style */}
          <div className="space-y-1.5">
            <Label className="text-[10px] text-[#555] uppercase tracking-[0.15em] font-medium">Visual Style</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {VISUAL_STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={`px-2 py-1.5 rounded-md text-[10px] font-medium transition-all border ${
                    style === s.value
                      ? 'bg-[#E8C547] text-[#0A0A0C] border-[#E8C547]'
                      : 'bg-[#1A1A1F] text-[#8A8A8E] border-[#2A2A30] hover:border-[#555] hover:text-[#F0EDE8]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Shot Count */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-[#555] uppercase tracking-[0.15em] font-medium">Shot Count</Label>
              <span className="text-xs font-mono text-[#E8C547] font-semibold">{shotCount}</span>
            </div>
            <Slider
              value={[shotCount]}
              onValueChange={(v) => setShotCount(v[0])}
              min={4}
              max={16}
              step={1}
              className="py-1"
            />
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !scene.trim()}
            className="w-full bg-[#E8C547] hover:bg-[#D4B23E] text-[#0A0A0C] font-bold h-10 text-xs tracking-wide transition-all gold-glow disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Re-directing...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Re-generate
              </>
            )}
          </Button>

          <Separator className="bg-[#2A2A30]" />

          {/* Actions Row */}
          <div className="flex gap-1.5">
            <Button
              onClick={handleSave}
              disabled={isSaving || shots.length === 0}
              variant="outline"
              size="sm"
              className="flex-1 bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] hover:bg-[#252530] hover:border-[#E8C547] h-8 text-[11px]"
            >
              {isSaving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
              Save
            </Button>
            <ExportDropdown />
            <Button
              onClick={() => setPresentationMode(true)}
              disabled={shots.length === 0}
              variant="outline"
              size="sm"
              className="flex-1 bg-[#E8C547]/10 border-[#E8C547]/30 text-[#E8C547] hover:bg-[#E8C547]/20 hover:border-[#E8C547] h-8 text-[11px] disabled:opacity-30"
              title="Present (Ctrl+P)"
            >
              <Maximize className="w-3 h-3 mr-1" />
              Present
            </Button>
          </div>

          {/* Undo/Redo */}
          <div className="flex gap-1.5">
            <Button
              onClick={undo}
              disabled={!canUndo}
              variant="outline"
              size="sm"
              className="flex-1 bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] hover:bg-[#252530] hover:border-[#E8C547] h-8 text-[11px] disabled:opacity-30"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3 h-3 mr-1" />
              Undo
            </Button>
            <Button
              onClick={redo}
              disabled={!canRedo}
              variant="outline"
              size="sm"
              className="flex-1 bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] hover:bg-[#252530] hover:border-[#E8C547] h-8 text-[11px] disabled:opacity-30"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-3 h-3 mr-1" />
              Redo
            </Button>
          </div>

          <Separator className="bg-[#2A2A30]" />

          {/* Saved Storyboards */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-[#555] uppercase tracking-[0.15em] font-medium">Saved Storyboards</Label>
              <button
                onClick={loadSavedStoryboards}
                className="text-[9px] text-[#E8C547] hover:underline flex items-center gap-1"
              >
                <FolderOpen className="w-2.5 h-2.5" />
                Refresh
              </button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {isLoadingStoryboards ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#555]" />
                </div>
              ) : savedList.length === 0 ? (
                <p className="text-[10px] text-[#444] py-2 text-center">No saved storyboards yet</p>
              ) : (
                savedList.map((sb) => (
                  <div
                    key={sb.id}
                    className="flex items-center justify-between group p-2 rounded-lg bg-[#1A1A1F] border border-[#2A2A30] hover:border-[#E8C547]/50 transition-all"
                  >
                    <button
                      onClick={() => handleLoad(sb.id!)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-[11px] text-[#F0EDE8] truncate">{sb.title}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-[#2A2A30] text-[#8A8A8E]">
                          {sb.style}
                        </Badge>
                        <span className="text-[8px] text-[#555]">{sb.shots.length} shots</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleDelete(sb.id!)}
                      className="opacity-0 group-hover:opacity-100 text-[#E84747] hover:text-[#FF6B6B] transition-all p-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-[#2A2A30]">
        <p className="text-[9px] text-[#444] text-center">
          Ctrl+Z Undo &middot; Ctrl+S Save &middot; Ctrl+P Present
        </p>
      </div>
    </aside>
  );
}
