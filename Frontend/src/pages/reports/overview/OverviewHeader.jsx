import { useMemo } from 'react';
import { Download, Settings2 } from 'lucide-react';
import { DateRangePicker, DATE_RANGE_PRESET_OPTIONS } from '@/components/ui/date-range-picker';
import { Button } from '@/components/ui/button';
import { formatPeriodLabel } from '../../../utils/formatPeriodLabel';

/**
 * Reports Overview page header with date range and actions.
 */
export default function OverviewHeader({
  title = 'Reports Overview',
  subtitle,
  dateRange,
  onDateRangeSelect,
  onPresetSelect,
  activePreset,
  onCustomize,
  onDownload,
  downloading = false,
  downloadLabel = 'Download Report',
}) {
  const pickerRange = useMemo(
    () => (dateRange?.[0] && dateRange?.[1]
      ? { from: dateRange[0].toDate(), to: dateRange[1].toDate() }
      : undefined),
    [dateRange]
  );

  return (
    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {subtitle || `Executive summary for ${formatPeriodLabel(activePreset, dateRange)}`}
        </p>
      </div>
      <div className="flex flex-col w-full lg:w-auto gap-2">
        <DateRangePicker
          range={pickerRange}
          onSelect={onDateRangeSelect}
          presets={DATE_RANGE_PRESET_OPTIONS}
          activePreset={activePreset}
          onPresetSelect={onPresetSelect}
          className="w-full md:w-auto md:min-w-[240px] border-border bg-card"
        />
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          <Button
            variant="outline"
            className="w-full sm:w-auto border-border bg-card min-h-[44px]"
            onClick={onCustomize}
          >
            <Settings2 className="mr-2 h-4 w-4 shrink-0" aria-hidden />
            Customize Dashboard
          </Button>
          <Button
            className="w-full sm:w-auto bg-brand hover:bg-brand-dark text-white min-h-[44px]"
            onClick={onDownload}
            disabled={downloading}
          >
            <Download className="mr-2 h-4 w-4 shrink-0" aria-hidden />
            {downloading ? 'Generating…' : downloadLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
