import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { STATUS_CHIP_CLASSES, STATUS_CHIP_DEFAULT_CLASS } from '../constants';

/**
 * StatusChip - A consistent status indicator component used throughout the app.
 * Uses STATUS_CHIP_CLASSES from constants for a single source of truth.
 * Supports status keys (e.g. out_of_stock) and label forms (e.g. "out of stock").
 */
const StatusChip = memo(({ status, className, ...props }) => {
  if (!status) return null;

  const raw = String(status).toLowerCase().trim();
  // Normalize: "out of stock" → out_of_stock, "in stock" → in_stock, "low stock" → low_stock
  const normalizedStatus = raw.includes(' ')
    ? raw.replace(/\s+/g, '_')
    : raw.replace(/-/g, '_');

  const chipClass =
    STATUS_CHIP_CLASSES[normalizedStatus] ??
    STATUS_CHIP_CLASSES[raw] ??
    STATUS_CHIP_DEFAULT_CLASS;

  const displayOverrides = {
    active_flag: 'Active',
    inactive_flag: 'Inactive',
    partially_paid: 'Partially paid',
    refunded: 'Refunded',
    partial_return: 'Partial return',
    exchanged: 'Exchanged',
    success: 'Success',
    failed: 'Failed',
    returning: 'Returning',
    new: 'New',
    disposed: 'Disposed',
    sold: 'Sold',
    sent: 'Sent',
    pending: 'Pending',
    pending_review: 'Pending review',
    live: 'Live',
    todo: 'To do',
  };
  const formatStatusText = (s) => {
    if (displayOverrides[s]) return displayOverrides[s];
    return s
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const displayText = displayOverrides[normalizedStatus] ?? formatStatusText(normalizedStatus);

  return (
    <Badge
      variant="outline"
      className={cn(
        'px-2.5 py-0.5 text-xs font-semibold border',
        chipClass,
        className
      )}
      {...props}
    >
      {displayText}
    </Badge>
  );
});

StatusChip.displayName = 'StatusChip';

export default StatusChip;
