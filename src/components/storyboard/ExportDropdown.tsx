'use client';

import { useCallback } from 'react';
import { useStoryboardStore } from '@/stores/storyboard';
import type { Storyboard, Shot } from '@/types/storyboard';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileImage, FileText, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

export function ExportDropdown() {
  const { shots, title, scene, style } = useStoryboardStore();

  const generateCsvContent = useCallback(() => {
    const header = 'Shot #,Shot Type,Action Description,Camera Note,Frame Description';
    const rows = shots.map(
      (s: Shot) =>
        `${s.shotNumber},"${s.shotType}","${s.actionDescription.replace(/"/g, '""')}","${s.cameraNote.replace(/"/g, '""')}","${s.frameDescription.replace(/"/g, '""')}"`
    );
    return [header, ...rows].join('\n');
  }, [shots]);

  const exportCSV = useCallback(() => {
    if (shots.length === 0) {
      toast.error('No shots to export');
      return;
    }
    try {
      const csv = generateCsvContent();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(title || 'storyboard').replace(/\s+/g, '_')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('CSV exported!');
    } catch {
      toast.error('Failed to export CSV');
    }
  }, [shots, title, generateCsvContent]);

  const exportPNG = useCallback(async () => {
    if (shots.length === 0) {
      toast.error('No shots to export');
      return;
    }
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const canvasEl = document.getElementById('shot-canvas');
      if (!canvasEl) {
        toast.error('Canvas not found');
        return;
      }
      const canvas = await html2canvas(canvasEl, {
        backgroundColor: '#0A0A0C',
        scale: 2,
        useCORS: true,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(title || 'storyboard').replace(/\s+/g, '_')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('PNG exported!');
    } catch {
      toast.error('Failed to export PNG');
    }
  }, [shots, title]);

  const exportPDF = useCallback(async () => {
    if (shots.length === 0) {
      toast.error('No shots to export');
      return;
    }
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      const colWidth = contentWidth / 2 - 5;
      const cardHeight = 70;

      // Title page
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.setTextColor(10, 10, 12);
      doc.text(title || 'Storyboard', pageWidth / 2, 40, { align: 'center' });
      doc.setFontSize(12);
      doc.setTextColor(138, 138, 142);
      doc.text(`Style: ${style}`, pageWidth / 2, 55, { align: 'center' });
      doc.text(`${shots.length} Shots`, pageWidth / 2, 65, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const sceneLines = doc.splitTextToSize(scene, contentWidth);
      doc.text(sceneLines, pageWidth / 2, 80, { align: 'center' });

      // Shot pages
      doc.addPage();
      let y = margin;
      let x = margin;
      let shotIndex = 0;

      for (const shot of shots) {
        if (y + cardHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
          x = margin;
        }

        // Card background
        doc.setFillColor(19, 19, 22);
        doc.roundedRect(x, y, colWidth, cardHeight, 2, 2, 'F');

        // Header bar
        doc.setFillColor(26, 26, 31);
        doc.roundedRect(x, y, colWidth, 8, 2, 2, 'F');

        // Shot number
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(232, 197, 71);
        doc.text(`SHOT ${shot.shotNumber}`, x + 4, y + 5.5);

        // Shot type badge
        doc.setFillColor(232, 197, 71);
        doc.roundedRect(x + colWidth - 18, y + 2, 16, 5, 1, 1, 'F');
        doc.setFontSize(7);
        doc.setTextColor(10, 10, 12);
        doc.text(shot.shotType, x + colWidth - 10, y + 5.5, { align: 'center' });

        // Action description
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(240, 237, 232);
        const actionLines = doc.splitTextToSize(shot.actionDescription, colWidth - 8);
        doc.text(actionLines.slice(0, 3), x + 4, y + 14);

        // Camera note
        doc.setTextColor(184, 153, 46);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        const cameraLines = doc.splitTextToSize(`\u{1F3AC} ${shot.cameraNote}`, colWidth - 8);
        doc.text(cameraLines.slice(0, 2), x + 4, y + cardHeight - 8);

        // Border
        doc.setDrawColor(42, 42, 48);
        doc.roundedRect(x, y, colWidth, cardHeight, 2, 2, 'S');

        // Alternate columns
        if (shotIndex % 2 === 0) {
          x = margin + colWidth + 10;
        } else {
          x = margin;
          y += cardHeight + 5;
        }
        shotIndex++;
      }

      doc.save(`${(title || 'storyboard').replace(/\s+/g, '_')}.pdf`);
      toast.success('PDF exported!');
    } catch {
      toast.error('Failed to export PDF');
    }
  }, [shots, title, scene, style]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={shots.length === 0}
          className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] hover:bg-[#252530] hover:border-[#E8C547] h-9"
        >
          <Download className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="bg-[#1A1A1F] border-[#2A2A30] text-[#F0EDE8] min-w-[160px]"
      >
        <DropdownMenuItem onClick={exportPNG} className="text-sm cursor-pointer focus:bg-[#252530] focus:text-[#F0EDE8]">
          <FileImage className="w-4 h-4 mr-2 text-[#E8C547]" />
          Export as PNG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPDF} className="text-sm cursor-pointer focus:bg-[#252530] focus:text-[#F0EDE8]">
          <FileText className="w-4 h-4 mr-2 text-[#E8C547]" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportCSV} className="text-sm cursor-pointer focus:bg-[#252530] focus:text-[#F0EDE8]">
          <FileSpreadsheet className="w-4 h-4 mr-2 text-[#E8C547]" />
          Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
