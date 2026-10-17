import { memo, useContext } from 'react';
import { Button } from '@/components/ui/button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Eye, MoreVertical } from 'lucide-react';
import { useResponsive } from '@/hooks/useResponsive';
import { cn } from '@/lib/utils';
import { CardTapContext } from './cardTapContext';

/**
 * Reusable Action Column Component for Tables
 * @param {Function} onView - Callback function when view button is clicked
 * @param {Object} record - The current row record
 * @param {Array} extraActions - Array of extra action objects with {label, onClick, type, icon}
 */
const ActionColumn = memo(({ onView, record, extraActions = [] }) => {
  const { isMobile } = useResponsive();
  const cardTap = useContext(CardTapContext);

  // Inside a phone/tablet card: tapping the card opens the record (no separate View button).
  if (cardTap && onView) {
    cardTap.open = () => onView(record);
    return null;
  }

  const viewButton = (
    <SecondaryButton
      onClick={() => onView(record)}
      size="sm"
      className={cn(isMobile && "w-full min-h-[44px]")}
    >
      <Eye className="h-4 w-4" />
      <span className="ml-2">View</span>
    </SecondaryButton>
  );

  if (extraActions.length === 0 || isMobile) {
    return (
      <div className={cn("flex items-center gap-1 md:gap-2", isMobile && "w-full flex-col")}>
        <Tooltip>
          <TooltipTrigger asChild>
            {viewButton}
          </TooltipTrigger>
          <TooltipContent>Click to view details</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1 md:gap-2")}>
      <Tooltip>
        <TooltipTrigger asChild>
          {viewButton}
        </TooltipTrigger>
        <TooltipContent>Click to view details</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <SecondaryButton size="sm">
                <MoreVertical className="h-4 w-4" />
              </SecondaryButton>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>More actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          {extraActions.map((action, index) => (
            <DropdownMenuItem
              key={index}
              onClick={action.disabled ? undefined : action.onClick}
              className="flex items-center gap-2"
              disabled={action.disabled}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

ActionColumn.displayName = 'ActionColumn';

export default ActionColumn;


