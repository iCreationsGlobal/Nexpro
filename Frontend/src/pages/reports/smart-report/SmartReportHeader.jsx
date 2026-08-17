import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Download, MoreVertical, Share2, Sparkles } from 'lucide-react';
import { SMART_REPORT_GENERATION_MODES } from './smartReportConstants';

/**
 * Smart Report page header matching product mockup.
 */
export default function SmartReportHeader({
  report,
  onBack,
  onShare,
  onDownloadPdf,
  downloading = false,
}) {
  const periodLabel = report?.periodLabel || report?.period || 'Report period';
  const isFreeText = report?.generationMode === SMART_REPORT_GENERATION_MODES.FREE_TEXT;
  const userPrompt = typeof report?.userPrompt === 'string' ? report.userPrompt.trim() : '';

  return (
    <div className="mb-4 md:mb-6 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-semibold text-foreground">Smart Report</h1>
            <Badge className="bg-primary/10 text-primary border border-primary/20 hover:bg-primary/10 gap-1 font-normal">
              <Sparkles className="h-3 w-3" aria-hidden />
              {isFreeText ? 'Described with AI' : 'AI Generated'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
          {userPrompt ? (
            <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 max-w-3xl">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Your question
              </p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{userPrompt}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to Smart Reports
          </Button>
          <Button variant="outline" size="sm" onClick={onShare} className="gap-2">
            <Share2 className="h-4 w-4" aria-hidden />
            Share Report
          </Button>
          <Button
            size="sm"
            className="bg-brand hover:bg-brand-dark text-white gap-2"
            onClick={onDownloadPdf}
            disabled={downloading}
          >
            <Download className="h-4 w-4" aria-hidden />
            {downloading ? 'Preparing…' : 'Download PDF'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="More actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onBack}>Back to list</DropdownMenuItem>
              <DropdownMenuItem onClick={onShare}>Share report</DropdownMenuItem>
              <DropdownMenuItem onClick={onDownloadPdf}>Download PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
