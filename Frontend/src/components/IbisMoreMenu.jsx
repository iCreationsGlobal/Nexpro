import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IBIS_CHAT_PERIOD_OPTIONS } from '@/utils/ibisChatPreferences';

/**
 * Header More menu for iBIS chat (session + local preferences).
 */
export function IbisMoreMenu({
  loading = false,
  onNewChat,
  defaultPeriod,
  onDefaultPeriodChange,
  showSuggestionChips,
  onShowSuggestionChipsChange,
  showAiSettings = false,
  onOpenAiSettings,
  triggerClassName,
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Ayebia settings"
          className={triggerClassName}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem disabled={loading} onSelect={() => onNewChat?.()}>
          New chat
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Default period</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={defaultPeriod} onValueChange={onDefaultPeriodChange}>
          {IBIS_CHAT_PERIOD_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.key} value={option.key}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={showSuggestionChips}
          onCheckedChange={(checked) => onShowSuggestionChipsChange?.(checked === true)}
        >
          Suggestion chips
        </DropdownMenuCheckboxItem>
        {showAiSettings ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onOpenAiSettings?.()}>
              Open Ayebia / AI settings
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
