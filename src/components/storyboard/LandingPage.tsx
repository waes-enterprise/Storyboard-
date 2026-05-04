'use client';

import { useState, useCallback, useRef } from 'react';
import { useStoryboardStore } from '@/stores/storyboard';
import { VISUAL_STYLES } from '@/types/storyboard';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Clapperboard, Sparkles, Loader2, Film, Zap, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { generateStoryboard } from '@/lib/generate-client';

interface LandingPageProps {
  onGenerated: () => void;
}

export function LandingPage({ onGenerated }: LandingPageProps) {
  const [scene, setScene] = useState('');
  const [style, setStyle] = useState('Raw Documentary');
  const [shotCount, setShotCount] = useState(10);
  const [title, setTitle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState('');
  const [progress, setProgress] = useState(0);

  const {
    setShots,
    setTitle: storeSetTitle,
    setScene: storeSetScene,
    setStyle: storeSetStyle,
    setShotCount: storeSetShotCount,
    clearShots,
  } = useStoryboardStore();

  const abortRef = useRef<AbortController | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!scene.trim()) {
      toast.error('Describe your scene first');
      return;
    }

    setIsGenerating(true);
    setGenerationStep('Analyzing scene...');
    setProgress(10);

    try {
      setGenerationStep('AI Director is planning your shots...');
      setProgress(25);

      const controller = new AbortController();
      abortRef.current = controller;

      let data: { shots?: unknown[]; error?: string };
      try {
        setGenerationStep('AI Director is planning your shots...');
        setProgress(30);

        data = await generateStoryboard(scene.trim(), style, shotCount, controller.signal);

        if (!data.shots || !Array.isArray(data.shots) || data.shots.length === 0) {
          throw new Error('AI returned no valid shots. Try a different scene description.');
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        toast.error(err instanceof Error ? err.message : 'Generation failed. Please try again.');
        setIsGenerating(false);
        setProgress(0);
        setGenerationStep('');
        return;
      } finally {
        abortRef.current = null;
      }

      setGenerationStep('Building your storyboard...');
      setProgress(60);

      // Store everything
      storeSetTitle(title || scene.trim().slice(0, 50) + (scene.trim().length > 50 ? '...' : ''));
      storeSetScene(scene.trim());
      storeSetStyle(style);
      storeSetShotCount(shotCount);

      // Brief delay for UX
      await new Promise((r) => setTimeout(r, 300));

      setGenerationStep('Complete!');
      setProgress(100);

      await new Promise((r) => setTimeout(r, 200));

      // Set shots and transition
      clearShots();
      setShots(data.shots);
      toast.success(`Director planned ${data.shots.length} shots!`);

      // Small delay before transitioning for smooth UX
      await new Promise((r) => setTimeout(r, 300));
      onGenerated();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setIsGenerating(false);
      setProgress(0);
      setGenerationStep('');
    }
  }, [scene, style, shotCount, title, setShots, storeSetTitle, storeSetScene, storeSetStyle, storeSetShotCount, clearShots, onGenerated]);

  return (
    <div className="min-h-screen bg-[#0A0A0C] flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden">
      {/* Background grain texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      }} />

      {/* Ambient light effect */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#E8C547]/[0.03] rounded-full blur-[120px]" />

      <div className="relative z-10 w-full max-w-2xl space-y-8">
        {/* Logo / Brand */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#E8C547] mb-2">
            <Clapperboard className="w-8 h-8 text-[#0A0A0C]" />
          </div>
          <h1 className="font-heading text-4xl md:text-5xl text-[#F0EDE8] tracking-tight">
            Storyboard AI
          </h1>
          <p className="text-sm text-[#8A8A8E] tracking-[0.2em] uppercase">
            AI-Powered Cinematic Shot Planner
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {[
            { icon: Eye, label: 'Raw Footage Aesthetic' },
            { icon: Zap, label: '10 Parallel Shots' },
            { icon: Film, label: 'Director Intelligence' },
          ].map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-[11px] text-[#8A8A8E] bg-[#131316] border border-[#2A2A30] rounded-full px-3 py-1.5">
              <Icon className="w-3 h-3 text-[#E8C547]" />
              {label}
            </span>
          ))}
        </div>

        {/* Input Form */}
        <div className="space-y-5 bg-[#0E0E11] border border-[#2A2A30] rounded-2xl p-6 md:p-8">
          {/* Title */}
          <div className="space-y-2">
            <Label className="text-[11px] text-[#555] uppercase tracking-[0.15em] font-medium">
              Storyboard Title
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Film — Scene 1"
              className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] placeholder:text-[#444] text-sm h-11"
            />
          </div>

          {/* Scene Description */}
          <div className="space-y-2">
            <Label className="text-[11px] text-[#555] uppercase tracking-[0.15em] font-medium">
              Scene Description
            </Label>
            <Textarea
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              placeholder="A detective enters a dimly lit office at dawn. She finds a torn photograph on the desk. Her hands tremble as she picks it up — it's a picture of someone she thought was dead."
              className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] placeholder:text-[#444] text-sm min-h-[140px] resize-none leading-relaxed"
            />
            <p className="text-[10px] text-[#555]">
              Be specific about characters, actions, and emotions for better shot planning.
            </p>
          </div>

          {/* Visual Style */}
          <div className="space-y-2">
            <Label className="text-[11px] text-[#555] uppercase tracking-[0.15em] font-medium">
              Visual Style
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {VISUAL_STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-all border ${
                    style === s.value
                      ? 'bg-[#E8C547] text-[#0A0A0C] border-[#E8C547] font-semibold'
                      : 'bg-[#1A1A1F] text-[#8A8A8E] border-[#2A2A30] hover:border-[#555] hover:text-[#F0EDE8]'
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
              <Label className="text-[11px] text-[#555] uppercase tracking-[0.15em] font-medium">
                Shot Count
              </Label>
              <span className="text-sm font-mono text-[#E8C547] font-semibold tabular-nums">
                {shotCount}
              </span>
            </div>
            <Slider
              value={[shotCount]}
              onValueChange={(v) => setShotCount(v[0])}
              min={4}
              max={16}
              step={1}
              className="py-2"
            />
            <div className="flex justify-between text-[10px] text-[#444]">
              <span>4 shots</span>
              <span>16 shots</span>
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !scene.trim()}
            className="w-full bg-[#E8C547] hover:bg-[#D4B23E] text-[#0A0A0C] font-bold h-12 text-sm tracking-wide transition-all gold-glow disabled:opacity-50 disabled:hover:bg-[#E8C547]"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {generationStep || 'Generating...'}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Storyboard
              </>
            )}
          </Button>

          {/* Progress bar */}
          {isGenerating && progress > 0 && (
            <div className="space-y-2">
              <div className="w-full h-1 bg-[#2A2A30] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#E8C547] transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] text-[#555] text-center">
                {progress < 30
                  ? 'AI Director is analyzing your scene...'
                  : progress < 70
                    ? 'Planning shot composition and camera movement...'
                    : progress < 100
                      ? 'Building storyboard with continuity lock...'
                      : 'Done! Loading your storyboard...'}
              </p>
            </div>
          )}
        </div>

        {/* Keyboard hint */}
        {!isGenerating && (
          <p className="text-center text-[10px] text-[#444]">
            Ctrl+Z Undo &middot; Ctrl+S Save &middot; Ctrl+P Present &middot; Ctrl+N New
          </p>
        )}
      </div>
    </div>
  );
}
