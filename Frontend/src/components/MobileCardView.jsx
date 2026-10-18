import { memo, useState, useMemo, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { EmptyState } from '@/components/ui/empty-state';
import { ChevronLeft, ChevronRight, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import SwipeableCard from './SwipeableCard';
import { useResponsive } from '@/hooks/useResponsive';
import { useDeviceMode } from '@/hooks/useDeviceMode';
import { CardTapContext } from './cardTapContext';
import InfiniteListFooter from './InfiniteListFooter';

/** Taps on these inside a card do their own thing instead of opening the record. */
const INTERACTIVE_IN_CARD =
  'button, a, input, select, textarea, label, [role="button"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="combobox"], [data-no-card-tap]';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/**
 * MobileCardView - Card-based layout for mobile devices
 * @param {Array} data - Array of data objects
 * @param {Array} columns - Column definitions: { key, label, render, hidden?, mobileDashboardPlacement?: 'headerEnd' } (headerEnd = top-right opposite first column in list + grid card views)
 * @param {boolean} loading - Loading state
 * @param {Object} emptyState - EmptyState config { icon, imageKey, title, description, primaryAction, secondaryAction }
 * @param {string} emptyDescription - (Legacy) Description text when empty
 * @param {string} emptyTitle - (Legacy) Title text when empty
 * @param {React.ReactNode} emptyIcon - Icon to show when empty
 * @param {React.ReactNode} emptyAction - Optional action button/content to show when empty
 * @param {number} pageSize - Number of items per page (default: 10)
 * @param {Function} onPageChange - Callback when page changes (optional, for external pagination)
 * @param {Object} externalPagination - External pagination state { current, total } (optional)
 * @param {Function} onCardClick - Optional callback when card is clicked
 * @param {Function} getSwipeActions - Optional function that returns { leftActions, rightActions } for each item
 * @param {boolean} enableSwipe - Whether to enable swipe actions (default: true on mobile)
 * @param {Function} getQuickActions - Optional function that returns quick action menu items for each item
 * @param {boolean} enableLongPress - Whether to enable long-press quick actions (default: true on mobile)
 * @param {boolean} gridLayout - When true, show cards in a multi-column grid (desktop grid mode); when false, single column stack
 * @param {Function} getCardImage - Optional function(record) => imageUrl to show a thumbnail at top of each card
 * @param {boolean} showLabelsInCardView - When false (default), omit column labels in card view for "no header" consistency
 * @param {{ hasMore: boolean, loadMore: Function, isLoadingMore: boolean }|null} infinite - Phones/tablets: `data` is every loaded row and more load on scroll instead of pages (see usePagedList)
 */
const MobileCardView = memo(({
  data = [],
  columns = [],
  loading = false,
  emptyState,
  emptyDescription = 'No items found',
  emptyTitle,
  emptyIcon,
  emptyAction,
  pageSize = 10,
  onPageChange,
  externalPagination,
  onCardClick,
  getSwipeActions,
  enableSwipe = true,
  getQuickActions,
  enableLongPress = true,
  gridLayout = false,
  getCardImage,
  showLabelsInCardView = false,
  infinite = null,
}) => {
  const { isMobile } = useResponsive();
  const { isAppShell } = useDeviceMode();
  const [internalPagination, setInternalPagination] = useState({ current: 1, pageSize });
  const longPressTimer = useRef(null);
  const longPressTarget = useRef(null);
  const [longPressMenuOpen, setLongPressMenuOpen] = useState(false);
  const [longPressItem, setLongPressItem] = useState(null);
  const [longPressIndex, setLongPressIndex] = useState(-1);
  const [longPressPosition, setLongPressPosition] = useState({ x: 0, y: 0 });
  
  // Use external pagination if provided, otherwise use internal
  const pagination = externalPagination || internalPagination;
  const setPagination = useCallback((updater) => {
    if (onPageChange) {
      const newPagination = typeof updater === 'function' ? updater(pagination) : updater;
      onPageChange(newPagination);
      return;
    }
    setInternalPagination(updater);
  }, [onPageChange, pagination]);

  const effectivePageSize = pagination.pageSize || pageSize;
  const totalItems = useMemo(() => externalPagination?.total ?? data.length, [externalPagination?.total, data.length]);
  const totalPages = useMemo(() => Math.ceil(totalItems / effectivePageSize), [totalItems, effectivePageSize]);
  const startIndex = useMemo(() => (pagination.current - 1) * effectivePageSize + 1, [pagination.current, effectivePageSize]);
  const endIndex = useMemo(() => Math.min(pagination.current * effectivePageSize, totalItems), [pagination.current, effectivePageSize, totalItems]);
  
  const scrollsForMore = Boolean(isAppShell && infinite);

  const paginatedData = useMemo(() => {
    if (externalPagination || scrollsForMore) {
      // External pagination - data is already paginated
      return data;
    }
    // Internal pagination - slice the data
    return data.slice(
      (pagination.current - 1) * effectivePageSize,
      pagination.current * effectivePageSize
    );
  }, [data, pagination.current, effectivePageSize, externalPagination, scrollsForMore]);

  const handlePageChange = useCallback((newPage) => {
    setPagination(prev => ({ ...prev, current: newPage, pageSize }));
  }, [pageSize, setPagination]);

  // Separate primary columns (first 2-3) from secondary columns
  // Filter out hidden columns (e.g. costPrice, margin on mobile)
  const visibleColumns = useMemo(() => 
    columns.filter(col => (col.key !== 'actions' && !col.label?.toLowerCase().includes('action')) && !col.hidden),
    [columns]
  );

  /** Shown top-right opposite the title row in dashboard card style (e.g. invoice status). */
  const headerEndColumns = useMemo(
    () => visibleColumns.filter((col) => col.mobileDashboardPlacement === 'headerEnd'),
    [visibleColumns]
  );

  const layoutColumns = useMemo(
    () => visibleColumns.filter((col) => col.mobileDashboardPlacement !== 'headerEnd'),
    [visibleColumns]
  );

  /** Mobile list: dashboard-style row. Grid/desktop cards: default stacked layout. */
  const useDashboardCardStyle = isMobile && !gridLayout;

  const primaryColumns = useMemo(() => {
    if (useDashboardCardStyle) return layoutColumns.slice(0, 3);
    // Grid / desktop card: first column is title row with headerEnd; body starts at index 1
    if (headerEndColumns.length > 0 && layoutColumns.length > 0) {
      return layoutColumns.slice(1, 4);
    }
    return layoutColumns.slice(0, 3);
  }, [useDashboardCardStyle, layoutColumns, headerEndColumns.length]);

  const secondaryColumns = useMemo(() => {
    if (useDashboardCardStyle) return layoutColumns.slice(3);
    if (headerEndColumns.length > 0 && layoutColumns.length > 0) {
      return layoutColumns.slice(4);
    }
    return layoutColumns.slice(3);
  }, [useDashboardCardStyle, layoutColumns, headerEndColumns.length]);

  // Find actions column
  const actionsColumn = useMemo(() => {
    return columns.find(col => col.key === 'actions' || col.label?.toLowerCase().includes('action'));
  }, [columns]);

  // Get swipe actions for each item (MUST be before early returns)
  const getItemSwipeActions = useMemo(() => {
    if (!getSwipeActions || !enableSwipe || !isMobile) {
      return () => ({ leftActions: [], rightActions: [] });
    }
    return getSwipeActions;
  }, [getSwipeActions, enableSwipe, isMobile]);

  // Get quick actions for each item (MUST be before early returns)
  const getItemQuickActions = useMemo(() => {
    if (!getQuickActions || !enableLongPress || !isMobile) {
      return () => [];
    }
    return getQuickActions;
  }, [getQuickActions, enableLongPress, isMobile]);

  // Check if quick actions are enabled (MUST be before early returns)
  const hasQuickActions = enableLongPress && isMobile && getQuickActions;

  // Handle long press (MUST be before early returns)
  const handleTouchStart = useCallback((e, item, index) => {
    if (!enableLongPress || !isMobile) return;

    longPressTarget.current = { item, index };
    const touch = e.touches?.[0] || e;
    
    longPressTimer.current = setTimeout(() => {
      // Trigger haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      // Show quick actions menu
      const quickActions = getItemQuickActions(item, index);
      if (quickActions && quickActions.length > 0) {
        setLongPressItem(item);
        setLongPressIndex(index);
        setLongPressPosition({ x: touch.clientX, y: touch.clientY });
        setLongPressMenuOpen(true);
      }
    }, 500); // 500ms long press
  }, [enableLongPress, isMobile, getItemQuickActions]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressTarget.current = null;
  }, []);

  const handleTouchMove = useCallback(() => {
    // Cancel long press if user moves finger
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const cardsContainerClass = gridLayout
    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
    : isMobile ? 'space-y-2' : 'space-y-3';

  // Scrolling lists keep their rows (and scroll position) while more load or the list refreshes.
  if (loading && !(scrollsForMore && data.length > 0)) {
    return (
      <div className={cardsContainerClass}>
        {[...Array(Math.min(pageSize, gridLayout ? 8 : pageSize))].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className={isMobile ? "px-4 py-3" : "p-4"}>
              <div className="h-4 bg-muted rounded w-3/4 mb-3"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!loading && data.length === 0) {
    return (
      <div className="flex w-full min-h-[min(50dvh,28rem)] items-center justify-center px-4 py-8">
        {emptyState ? (
          <EmptyState
            className="w-full max-w-md py-8"
            icon={emptyState.icon}
            image={emptyState.image}
            imageKey={emptyState.imageKey}
            imageAlt={emptyState.imageAlt}
            title={emptyState.title}
            description={emptyState.description}
            primaryAction={emptyState.primaryAction}
            secondaryAction={emptyState.secondaryAction}
          />
        ) : (
          <div className="text-center space-y-3">
            {emptyTitle && <h3 className="text-lg font-medium">{emptyTitle}</h3>}
            <Empty
              description={emptyDescription}
              image={emptyIcon}
            />
            {emptyAction}
          </div>
        )}
      </div>
    );
  }

  // Get quick actions for long-pressed item
  const longPressQuickActions = longPressItem && longPressIndex !== -1
    ? getItemQuickActions(longPressItem, longPressIndex)
    : [];

  return (
    <>
      {/* Long Press Quick Actions Menu */}
      {hasQuickActions && longPressQuickActions.length > 0 && (
        <Popover open={longPressMenuOpen} onOpenChange={setLongPressMenuOpen}>
          <PopoverTrigger asChild>
            <div className="hidden" />
          </PopoverTrigger>
          <PopoverContent
            className="w-56 p-1"
            style={{
              position: 'fixed',
              left: `${longPressPosition.x}px`,
              top: `${longPressPosition.y}px`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="flex flex-col">
              {longPressQuickActions.map((action, actionIndex) => (
                <Button
                  key={actionIndex}
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick?.(longPressItem, longPressIndex);
                    setLongPressMenuOpen(false);
                    setLongPressItem(null);
                    setLongPressIndex(-1);
                  }}
                  className="justify-start min-h-[44px] w-full"
                >
                  {action.icon && <action.icon className="mr-2 h-4 w-4" />}
                  <span>{action.label}</span>
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <div className={cardsContainerClass}>
        {/* Cards */}
        {paginatedData.map((item, index) => {
        const swipeActions = getItemSwipeActions(item, index);
        const { leftActions = [], rightActions = [] } = swipeActions || {};
        const hasSwipeActions = (leftActions.length > 0 || rightActions.length > 0) && enableSwipe && isMobile;

        const quickActions = getItemQuickActions(item, index);
        const hasItemQuickActions = quickActions && quickActions.length > 0 && enableLongPress && isMobile;

        const cardImageUrl = getCardImage ? getCardImage(item) : null;
        const columnLabel = (col) => col.label ?? col.title ?? col.key;

        // Phones/tablets: ActionColumn puts its View action here, so the whole card opens the record.
        const tapTarget = isAppShell ? { open: null } : null;
        const tappable = Boolean(onCardClick || (tapTarget && actionsColumn));
        const handleCardClick = (event) => {
          if (event.target instanceof Element && event.target.closest(INTERACTIVE_IN_CARD)) return;
          if (onCardClick) onCardClick(item, index);
          else tapTarget?.open?.();
        };

        const cardContent = (
          <CardTapContext.Provider key={item.id || item.key || index} value={tapTarget}>
          <Card 
            className={cn(
              "transition-colors overflow-hidden border",
              tappable && "cursor-pointer hover:bg-muted active:bg-muted/80",
              hasItemQuickActions && "select-none" // Prevent text selection during long press
            )}
            onClick={handleCardClick}
            onTouchStart={(e) => handleTouchStart(e, item, index)}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchMove}
          >
            {cardImageUrl && (
              <div className="w-full h-24 sm:h-28 bg-muted flex-shrink-0">
                <img
                  src={cardImageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            )}
            <CardContent className={cn(isMobile ? "px-4 py-3" : "p-4", cardImageUrl && "pt-3")}>
              {useDashboardCardStyle ? (
                <>
                  {/* Mobile list: label on left, value on right for scanability */}
                  <div className="space-y-2">
                    {[...primaryColumns, ...headerEndColumns, ...secondaryColumns.slice(0, 2)].map((column) => {
                      const value = column.render
                        ? column.render(item[column.key], item, index)
                        : (item[column.key] ?? '—');
                      return (
                        <div key={column.key} className="flex items-start justify-between gap-3">
                          <span className="text-sm text-muted-foreground shrink-0">
                            {columnLabel(column)}
                          </span>
                          <div className="text-sm text-foreground text-right min-w-0">
                            {value}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Actions - full width View Details */}
                  {actionsColumn && (
                    <div className="mt-2 pt-2 border-t empty:hidden">
                      {actionsColumn.render && actionsColumn.render(null, item, index)}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Grid / tablet: title + status (headerEnd) on one row */}
                  {!useDashboardCardStyle && headerEndColumns.length > 0 && layoutColumns[0] && (
                    <div className="flex justify-between items-start gap-2 mb-3 pb-3 border-b border-border">
                      <div className="min-w-0 flex-1 text-foreground font-medium">
                        {layoutColumns[0].render
                          ? layoutColumns[0].render(item[layoutColumns[0].key], item, index)
                          : (item[layoutColumns[0].key] ?? '—')}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1 text-right">
                        {headerEndColumns.map((col) => (
                          <div key={col.key}>
                            {col.render
                              ? col.render(item[col.key], item, index)
                              : (item[col.key] ?? '—')}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Default: label-value layout (no labels when showLabelsInCardView is false) */}
                  <div className="space-y-2 mb-3">
                    {primaryColumns.map((column) => {
                      const value = column.render 
                        ? column.render(item[column.key], item, index)
                        : (item[column.key] !== undefined && item[column.key] !== null ? item[column.key] : '—');
                      return (
                        <div key={column.key} className="flex items-start justify-between gap-2">
                          {showLabelsInCardView && (
                            <span className="text-sm font-medium text-gray-500 min-w-[80px]">
                              {columnLabel(column)}:
                            </span>
                          )}
                          <span className={cn(
                            "text-sm text-foreground flex-1",
                            showLabelsInCardView ? "text-right" : ""
                          )}>
                            {value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {secondaryColumns.length > 0 && (
                    <div className="space-y-1.5 pt-2 -mx-4 px-4 border-t border-gray-200">
                      {secondaryColumns.slice(0, 2).map((column) => {
                        const value = column.render 
                          ? column.render(item[column.key], item, index)
                          : (item[column.key] !== undefined && item[column.key] !== null ? item[column.key] : '—');
                        return (
                          <div key={column.key} className="flex items-center justify-between gap-2">
                            {showLabelsInCardView && (
                              <span className="text-xs text-gray-400 min-w-[70px]">
                                {columnLabel(column)}:
                              </span>
                            )}
                            <span className={cn(
                              "text-xs text-gray-600 flex-1 truncate",
                              showLabelsInCardView ? "text-right" : ""
                            )}>
                              {value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {actionsColumn && (
                    <div className="mt-3 pt-3 -mx-4 px-4 border-t border-gray-200 [&:has(>div:empty)]:hidden">
                      <div className={cn("flex gap-2", isMobile ? "w-full flex-col" : "justify-end")}>
                        {actionsColumn.render && actionsColumn.render(null, item, index)}
                      </div>
                    </div>
                  )}
                  {onCardClick && (
                    <div className="mt-2 flex justify-end">
                      <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          </CardTapContext.Provider>
        );

        // Wrap content (quick actions handled separately via state)
        const wrappedContent = cardContent;

        // Wrap in SwipeableCard if swipe actions are available
        if (hasSwipeActions) {
          return (
            <SwipeableCard
              key={item.id || item.key || index}
              leftActions={leftActions}
              rightActions={rightActions}
            >
              {wrappedContent}
            </SwipeableCard>
          );
        }

        return wrappedContent;
        })}
      </div>

      {scrollsForMore ? (
        <InfiniteListFooter
          hasMore={infinite.hasMore}
          loadMore={infinite.loadMore}
          isLoadingMore={infinite.isLoadingMore}
          count={data.length}
          className="mt-2"
        />
      ) : totalItems > 0 && (
        <div className={cn(
          'flex flex-col sm:flex-row items-center justify-between gap-3 w-full',
          gridLayout
            ? 'mt-6'
            : cn('mt-4 border-t border-gray-200', isMobile ? 'py-3 px-4' : 'py-4 px-2')
        )}>
          <div className="text-sm text-muted-foreground text-center sm:text-left">
            Showing {startIndex} to {endIndex} of {totalItems} items
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.current - 1)}
              disabled={pagination.current === 1 || loading}
              className="min-h-[44px] min-w-[44px]"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Previous</span>
            </Button>
            <div className="text-sm px-2">
              Page {pagination.current} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.current + 1)}
              disabled={pagination.current === totalPages || loading}
              className="min-h-[44px] min-w-[44px]"
            >
              <span className="hidden sm:inline mr-1">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
});

MobileCardView.displayName = 'MobileCardView';

export default MobileCardView;
