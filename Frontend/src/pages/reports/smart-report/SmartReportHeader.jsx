import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Download, MoreVertical, Share2 } from 'lucide-react';

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

  return (
    <div className="mb-4 md:mb-6 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl md:text-2xl font-semibold text-foreground">Smart Report</h1>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
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
