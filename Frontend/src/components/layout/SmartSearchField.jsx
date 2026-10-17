import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Clock, CornerDownLeft, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSmartSearch } from '@/context/SmartSearchContext';
import { cn } from '@/lib/utils';

/**
 * Header search bound to the page's SmartSearch scope, with per-scope recent searches.
 * Used by the desktop Header and the phone/tablet AppHeader.
 * @param {object} props
 * @param {string} [props.className] - Wrapper classes
 * @param {string} [props.inputClassName]
 * @param {boolean} [props.autoFocus]
 */
export default function SmartSearchField({ className, inputClassName, autoFocus = false }) {
  const {
    placeholder,
    scope,
    searchValue,
    setSearchValue,
    recentSearches,
    saveRecentSearch,
    clearRecentSearches,
  } = useSmartSearch();
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [activeRecentIndex, setActiveRecentIndex] = useState(-1);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!autoFocus) return undefined;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 100);
    return () => window.clearTimeout(timer);
  }, [autoFocus]);

  // Close suggestions when tapping outside
  useEffect(() => {
    if (!isSuggestionsOpen) return undefined;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsSuggestionsOpen(false);
        setActiveRecentIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isSuggestionsOpen]);

  const recentSearchOptions = useMemo(() => {
    const term = searchValue.trim().toLowerCase();
    return (recentSearches || []).filter((recentTerm) => {
      const normalized = String(recentTerm || '').trim().toLowerCase();
      if (!normalized) return false;
      return !term || normalized.includes(term);
    });
  }, [recentSearches, searchValue]);

  const hasSearchValue = searchValue.trim().length > 0;
  const shouldShowRecentSearches = isSuggestionsOpen && recentSearchOptions.length > 0;

  const commitSearchTerm = useCallback((term) => {
    const nextTerm = String(term || '').trim();
    if (!nextTerm) return;

    setSearchValue(nextTerm);
    saveRecentSearch(nextTerm);
    setIsSuggestionsOpen(false);
    setActiveRecentIndex(-1);
    inputRef.current?.focus();
  }, [saveRecentSearch, setSearchValue]);

  const handleChange = useCallback((event) => {
    setSearchValue(event.target.value);
    setIsSuggestionsOpen(true);
    setActiveRecentIndex(-1);
  }, [setSearchValue]);

  const handleBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      // Delay to allow click events to fire first.
      window.setTimeout(() => {
        setIsSuggestionsOpen(false);
        setActiveRecentIndex(-1);
      }, 200);
    }
  };

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const selectedTerm = activeRecentIndex >= 0 ? recentSearchOptions[activeRecentIndex] : searchValue;
      commitSearchTerm(selectedTerm);
      // Phones: Enter ("Search" on the keyboard) dismisses the keyboard.
      if (activeRecentIndex < 0) inputRef.current?.blur();
      return;
    }

    if (event.key === 'Escape') {
      setIsSuggestionsOpen(false);
      setActiveRecentIndex(-1);
      return;
    }

    if (!recentSearchOptions.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsSuggestionsOpen(true);
      setActiveRecentIndex((current) => (current + 1) % recentSearchOptions.length);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsSuggestionsOpen(true);
      setActiveRecentIndex((current) => (
        current <= 0 ? recentSearchOptions.length - 1 : current - 1
      ));
    }
  }, [activeRecentIndex, commitSearchTerm, recentSearchOptions, searchValue]);

  return (
    <div ref={containerRef} className={cn('relative', className)} data-tour="header-search">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        key={scope}
        type="search"
        enterKeyHint="search"
        placeholder={placeholder}
        value={searchValue}
        onChange={handleChange}
        onFocus={() => setIsSuggestionsOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={cn('w-full rounded-full pl-10', hasSearchValue && 'pr-10', inputClassName)}
        aria-label={placeholder}
      />
      {hasSearchValue && (
        <button
          type="button"
          onClick={() => {
            setSearchValue('');
            inputRef.current?.focus();
          }}
          className="absolute right-1 top-1/2 flex h-9 w-9 min-h-0 min-w-0 -translate-y-1/2 items-center justify-center rounded-full p-0 text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {shouldShowRecentSearches && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Recent searches
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => clearRecentSearches()}
            >
              Clear
            </Button>
          </div>
          <div className="py-1">
            {recentSearchOptions.map((recentTerm, index) => (
              <button
                key={`${scope}-${recentTerm}`}
                type="button"
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors',
                  activeRecentIndex === index ? 'bg-muted text-foreground' : 'hover:bg-muted/70'
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitSearchTerm(recentTerm)}
              >
                <span className="truncate">{recentTerm}</span>
                <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
          {hasSearchValue ? (
            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              Press Enter to search for &quot;{searchValue.trim()}&quot;.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
