'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStoryboardStore } from '@/stores/storyboard';
import { Button } from '@/components/ui/button';
import { Clapperboard, Plus, FolderOpen, Trash2, Clock, ArrowRight, Loader2, Film, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { Storyboard } from '@/types/storyboard';

interface WorkspaceDashboardProps {
  onNewStoryboard: () => void;
  onResume: () => void;
}

export function WorkspaceDashboard({ onNewStoryboard, onResume }: WorkspaceDashboardProps) {
  const [savedStoryboards, setSavedStoryboards] = useState<Storyboard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadStoryboard = useStoryboardStore((s) => s.loadStoryboard);
  const clearShots = useStoryboardStore((s) => s.clearShots);
  const currentStoryboardId = useStoryboardStore((s) => s.currentStoryboardId);
  const shots = useStoryboardStore((s) => s.shots);

  const fetchStoryboards = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/storyboards');
      if (res.ok) {
        const data = await res.json();
        setSavedStoryboards(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStoryboards();
  }, [fetchStoryboards]);

  const handleLoad = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/storyboards/${id}`);
      if (res.ok) {
        const data = await res.json();
        loadStoryboard(data);
        toast.success(`Resumed "${data.title}"`);
        onResume();
      } else {
        toast.error('Failed to load storyboard');
      }
    } catch {
      toast.error('Failed to load storyboard');
    }
  }, [loadStoryboard, onResume]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/storyboards/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Storyboard deleted');
        fetchStoryboards();
      }
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }, [fetchStoryboards]);

  const handleNew = useCallback(() => {
    clearShots();
    onNewStoryboard();
  }, [clearShots, onNewStoryboard]);

  const handleResumeCurrent = useCallback(() => {
    onResume();
  }, [onResume]);

  const hasCurrentSession = shots.length > 0 && currentStoryboardId;

  // Group storyboards by date
  const groupedStoryboards = savedStoryboards.reduce<Record<string, Storyboard[]>>((acc, sb) => {
    const dateStr = sb.updatedAt
      ? new Date(sb.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown date';
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(sb);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0A0A0C] flex flex-col relative overflow-hidden">
      {/* Background grain texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      }} />
      {/* Ambient light */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#E8C547]/[0.03] rounded-full blur-[120px]" />

      <div className="relative z-10 flex-1 flex flex-col max-w-4xl w-full mx-auto px-4 md:px-8 py-8 md:py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E8C547] flex items-center justify-center">
              <Clapperboard className="w-5 h-5 text-[#0A0A0C]" />
            </div>
            <div>
              <h1 className="font-heading text-2xl text-[#F0EDE8]">Workspaces</h1>
              <p className="text-xs text-[#555]">Manage your storyboards</p>
            </div>
          </div>
          <Button
            onClick={handleNew}
            className="bg-[#E8C547] hover:bg-[#D4B23E] text-[#0A0A0C] font-bold h-10 px-5 text-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Session
          </Button>
        </div>

        {/* Current Session Banner */}
        {hasCurrentSession && (
          <div
            onClick={handleResumeCurrent}
            className="mb-8 bg-gradient-to-r from-[#E8C547]/10 to-[#E8C547]/5 border border-[#E8C547]/30 rounded-xl p-4 md:p-5 cursor-pointer hover:border-[#E8C547]/60 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#E8C547]/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-[#E8C547]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#F0EDE8]">
                      {useStoryboardStore.getState().title || 'Current Storyboard'}
                    </p>
                    <span className="text-[9px] bg-[#E8C547]/20 text-[#E8C547] px-2 py-0.5 rounded-full font-medium">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-[#8A8A8E] mt-0.5">
                    {shots.length} shots &middot; {useStoryboardStore.getState().style}
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-[#E8C547] group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        )}

        {/* Quick Start Cards */}
        <div className="mb-8">
          <h2 className="text-xs text-[#555] uppercase tracking-[0.15em] font-medium mb-3">Quick Start</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={handleNew}
              className="bg-[#0E0E11] border border-[#2A2A30] hover:border-[#E8C547]/40 rounded-xl p-4 text-left transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-[#E8C547]/10 flex items-center justify-center mb-3">
                <Plus className="w-4 h-4 text-[#E8C547]" />
              </div>
              <p className="text-sm font-medium text-[#F0EDE8] group-hover:text-[#E8C547] transition-colors">
                New Storyboard
              </p>
              <p className="text-[11px] text-[#555] mt-1">Start fresh with a new scene</p>
            </button>
            <button
              onClick={fetchStoryboards}
              className="bg-[#0E0E11] border border-[#2A2A30] hover:border-[#E8C547]/40 rounded-xl p-4 text-left transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-[#E8C547]/10 flex items-center justify-center mb-3">
                <FolderOpen className="w-4 h-4 text-[#E8C547]" />
              </div>
              <p className="text-sm font-medium text-[#F0EDE8] group-hover:text-[#E8C547] transition-colors">
                Browse Saved
              </p>
              <p className="text-[11px] text-[#555] mt-1">{savedStoryboards.length} saved storyboard{savedStoryboards.length !== 1 ? 's' : ''}</p>
            </button>
            <button
              onClick={handleResumeCurrent}
              disabled={!hasCurrentSession}
              className="bg-[#0E0E11] border border-[#2A2A30] hover:border-[#E8C547]/40 rounded-xl p-4 text-left transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="w-9 h-9 rounded-lg bg-[#E8C547]/10 flex items-center justify-center mb-3">
                <Clock className="w-4 h-4 text-[#E8C547]" />
              </div>
              <p className="text-sm font-medium text-[#F0EDE8] group-hover:text-[#E8C547] transition-colors">
                Resume Session
              </p>
              <p className="text-[11px] text-[#555] mt-1">
                {hasCurrentSession ? `${shots.length} shots in progress` : 'No active session'}
              </p>
            </button>
          </div>
        </div>

        {/* Saved Storyboards List */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs text-[#555] uppercase tracking-[0.15em] font-medium">Saved Workspaces</h2>
            <button
              onClick={fetchStoryboards}
              className="text-[10px] text-[#E8C547] hover:underline flex items-center gap-1"
            >
              <FolderOpen className="w-2.5 h-2.5" />
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-[#555]" />
            </div>
          ) : savedStoryboards.length === 0 ? (
            <div className="bg-[#0E0E11] border border-[#2A2A30] rounded-xl p-8 md:p-12 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-[#1A1A1F] border border-[#2A2A30] flex items-center justify-center mb-4">
                <Film className="w-7 h-7 text-[#555]" />
              </div>
              <h3 className="text-base text-[#F0EDE8] mb-2">No saved workspaces yet</h3>
              <p className="text-sm text-[#8A8A8E] mb-6 max-w-sm mx-auto">
                Create your first storyboard and it will appear here. You can resume any saved session at any time.
              </p>
              <Button
                onClick={handleNew}
                className="bg-[#E8C547] hover:bg-[#D4B23E] text-[#0A0A0C] font-bold h-10 px-6 text-sm"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Create First Storyboard
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedStoryboards).map(([dateLabel, items]) => (
                <div key={dateLabel}>
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">{dateLabel}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {items.map((sb) => (
                      <div
                        key={sb.id}
                        className="flex items-center justify-between bg-[#0E0E11] border border-[#2A2A30] hover:border-[#E8C547]/40 rounded-xl p-3.5 transition-all group"
                      >
                        <button
                          onClick={() => handleLoad(sb.id!)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="text-sm text-[#F0EDE8] truncate group-hover:text-[#E8C547] transition-colors">
                            {sb.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] bg-[#1A1A1F] border border-[#2A2A30] text-[#8A8A8E] px-1.5 py-0.5 rounded">
                              {sb.style}
                            </span>
                            <span className="text-[9px] text-[#555]">{sb.shots.length} shots</span>
                          </div>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(sb.id!);
                          }}
                          disabled={deletingId === sb.id}
                          className="ml-2 p-1.5 text-[#555] hover:text-[#E84747] hover:bg-[#E84747]/10 rounded-lg transition-all disabled:opacity-50"
                        >
                          {deletingId === sb.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-[#2A2A30] flex items-center justify-between">
          <p className="text-[10px] text-[#444]">
            Ctrl+N New &middot; Ctrl+S Save &middot; Ctrl+P Present
          </p>
          <p className="text-[10px] text-[#444]">
            Storyboard AI v2
          </p>
        </div>
      </div>
    </div>
  );
}
