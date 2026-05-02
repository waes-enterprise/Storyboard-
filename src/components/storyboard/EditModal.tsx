'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStoryboardStore } from '@/stores/storyboard';
import { SHOT_TYPES, type Shot } from '@/types/storyboard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface EditModalProps {
  shot: Shot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditModal({ shot, open, onOpenChange }: EditModalProps) {
  const [formState, setFormState] = useState({
    shotType: 'MS',
    actionDescription: '',
    cameraNote: '',
    frameDescription: '',
  });

  const { updateShot, regenerateImageForShot } = useStoryboardStore();

  // Sync form when modal opens with a shot
  useEffect(() => {
    if (shot && open) {
      setFormState({
        shotType: shot.shotType,
        actionDescription: shot.actionDescription,
        cameraNote: shot.cameraNote,
        frameDescription: shot.frameDescription,
      });
    }
  }, [shot, open]);

  const updateField = useCallback((field: string, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = () => {
    if (!shot) return;
    if (!formState.actionDescription.trim()) {
      toast.error('Action description is required');
      return;
    }
    updateShot(shot.id, {
      shotType: formState.shotType,
      actionDescription: formState.actionDescription.trim(),
      cameraNote: formState.cameraNote.trim(),
      frameDescription: formState.frameDescription.trim(),
    });
    toast.success('Shot updated');
    onOpenChange(false);
  };

  const handleRegenerateImage = () => {
    if (!shot) return;
    onOpenChange(false);
    setTimeout(() => {
      regenerateImageForShot(shot.id);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#131316] border-[#2A2A30] text-[#F0EDE8] max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-[#E8C547]">
            Edit Shot {shot?.shotNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Shot Type */}
          <div className="space-y-2">
            <Label className="text-xs text-[#8A8A8E] uppercase tracking-wider">Shot Type</Label>
            <Select
              value={formState.shotType}
              onValueChange={(v) => updateField('shotType', v)}
            >
              <SelectTrigger className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1A1A1F] border-[#2A2A30]">
                {SHOT_TYPES.map((type) => (
                  <SelectItem
                    key={type.value}
                    value={type.value}
                    className="text-[#F0EDE8] focus:bg-[#252530] focus:text-[#E8C547]"
                  >
                    {type.value} — {type.full}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Description */}
          <div className="space-y-2">
            <Label className="text-xs text-[#8A8A8E] uppercase tracking-wider">Action Description</Label>
            <Textarea
              value={formState.actionDescription}
              onChange={(e) => updateField('actionDescription', e.target.value)}
              className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] text-sm min-h-[100px] resize-none"
              placeholder="What happens in this shot..."
            />
          </div>

          {/* Camera Note */}
          <div className="space-y-2">
            <Label className="text-xs text-[#8A8A8E] uppercase tracking-wider">Camera Note</Label>
            <Input
              value={formState.cameraNote}
              onChange={(e) => updateField('cameraNote', e.target.value)}
              className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] text-sm"
              placeholder="e.g. Slow dolly left, handheld push-in..."
            />
          </div>

          {/* Frame Description */}
          <div className="space-y-2">
            <Label className="text-xs text-[#8A8A8E] uppercase tracking-wider">
              Frame Description <span className="text-[#555]">(for image generation)</span>
            </Label>
            <Textarea
              value={formState.frameDescription}
              onChange={(e) => updateField('frameDescription', e.target.value)}
              className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] text-sm min-h-[80px] resize-none"
              placeholder="Detailed visual description of the frame composition..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              className="flex-1 bg-[#E8C547] hover:bg-[#D4B23E] text-[#0A0A0C] font-semibold h-10"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
            <Button
              onClick={handleRegenerateImage}
              variant="outline"
              className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] hover:bg-[#252530] hover:border-[#E8C547] h-10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Regen Image
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="bg-[#1A1A1F] border-[#2A2A30] text-[#8A8A8E] hover:bg-[#252530] h-10"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
