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
  Eye,
  EyeOff,
  Film,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Storyboard } from '@/types/storyboard';
import { ExportDropdown } from './ExportDropdown';

export function Sidebar() {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
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
  } = useStoryboardStore();

  // Load API key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('storyboard-ai-apikey');
    if (saved) setApiKey(saved);
  }, []);

  // Save API key to localStorage on change
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('storyboard-ai-apikey', apiKey);
    }
  }, [apiKey]);

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
    if (!apiKey.trim()) {
      toast.error('Please enter your Anthropic API key');
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
          apiKey: apiKey.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to generate storyboard');
        return;
      }

      setShots(data.shots);
      const autoTitle = scene.trim().slice(0, 50) + (scene.trim().length > 50 ? '...' : '');
      setTitle(autoTitle);
      toast.success(`Generated ${data.shots.length} shots!`);
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
    clearShots();
    toast.success('Cleared canvas');
  };

  return (
    <aside className="w-full md:w-[340px] flex-shrink-0 bg-[#0E0E11] border-r border-[#2A2A30] flex flex-col h-screen overflow-hidden">
      {/* Brand */}
      <div className="p-5 border-b border-[#2A2A30]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#E8C547] flex items-center justify-center">
            <Clapperboard className="w-5 h-5 text-[#0A0A0C]" />
          </div>
          <div>
            <h1 className="font-heading text-xl text-[#F0EDE8] leading-tight">Storyboard AI</h1>
            <p className="text-xs text-[#8A8A8E] tracking-wider uppercase">Cinematic Shot Planner</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">
          {/* Title */}
          <div className="space-y-2">
            <Label className="text-xs text-[#8A8A8E] uppercase tracking-wider">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Storyboard"
              className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] placeholder:text-[#555] text-sm"
            />
          </div>

          {/* Scene Description */}
          <div className="space-y-2">
            <Label className="text-xs text-[#8A8A8E] uppercase tracking-wider">Scene Description</Label>
            <Textarea
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              placeholder="Describe your scene... e.g. A detective enters a dimly lit office, finds a letter on the desk, and reads it with trembling hands."
              className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] placeholder:text-[#555] text-sm min-h-[120px] resize-none"
            />
          </div>

          {/* Visual Style */}
          <div className="space-y-2">
            <Label className="text-xs text-[#8A8A8E] uppercase tracking-wider">Visual Style</Label>
            <div className="grid grid-cols-3 gap-2">
              {VISUAL_STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                    style === s.value
                      ? 'bg-[#E8C547] text-[#0A0A0C] border-[#E8C547]'
                      : 'bg-[#1A1A1F] text-[#8A8A8E] border-[#2A2A30] hover:border-[#E8C547] hover:text-[#F0EDE8]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Shot Count */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-[#8A8A8E] uppercase tracking-wider">Shot Count</Label>
              <span className="text-sm font-mono text-[#E8C547] font-semibold">{shotCount}</span>
            </div>
            <Slider
              value={[shotCount]}
              onValueChange={(v) => setShotCount(v[0])}
              min={4}
              max={16}
              step={1}
              className="py-2"
            />
            <div className="flex justify-between text-[10px] text-[#555]">
              <span>4</span>
              <span>16</span>
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !scene.trim()}
            className="w-full bg-[#E8C547] hover:bg-[#D4B23E] text-[#0A0A0C] font-semibold h-11 transition-all gold-glow disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Storyboard
              </>
            )}
          </Button>

          <Separator className="bg-[#2A2A30]" />

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || shots.length === 0}
              variant="outline"
              size="sm"
              className="flex-1 bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] hover:bg-[#252530] hover:border-[#E8C547] h-9"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 mr-1.5" />
              )}
              Save
            </Button>
            <ExportDropdown />
            <Button
              onClick={handleNew}
              variant="outline"
              size="sm"
              className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] hover:bg-[#252530] hover:border-[#E8C547] h-9"
            >
              <Film className="w-3.5 h-3.5 mr-1.5" />
              New
            </Button>
          </div>

          <Separator className="bg-[#2A2A30]" />

          {/* API Key */}
          <div className="space-y-2">
            <Label className="text-xs text-[#8A8A8E] uppercase tracking-wider">Anthropic API Key</Label>
            <div className="relative">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] placeholder:text-[#555] text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A8E] hover:text-[#F0EDE8] transition-colors"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-[#555]">Your key is sent securely to our server — never shared directly with Anthropic from your browser</p>
          </div>

          <Separator className="bg-[#2A2A30]" />

          {/* Saved Storyboards */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-[#8A8A8E] uppercase tracking-wider">Saved Storyboards</Label>
              <button
                onClick={loadSavedStoryboards}
                className="text-[10px] text-[#E8C547] hover:underline flex items-center gap-1"
              >
                <FolderOpen className="w-3 h-3" />
                Refresh
              </button>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {isLoadingStoryboards ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-[#555]" />
                </div>
              ) : savedList.length === 0 ? (
                <p className="text-xs text-[#555] py-2 text-center">No saved storyboards yet</p>
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
                      <p className="text-xs text-[#F0EDE8] truncate">{sb.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-[#2A2A30] text-[#8A8A8E]">
                          {sb.style}
                        </Badge>
                        <span className="text-[9px] text-[#555]">{sb.shots.length} shots</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleDelete(sb.id!)}
                      className="opacity-0 group-hover:opacity-100 text-[#E84747] hover:text-[#FF6B6B] transition-all p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-[#2A2A30]">
        <p className="text-[10px] text-[#555] text-center">
          Powered by Claude + Pollinations AI
        </p>
      </div>
    </aside>
  );
}
