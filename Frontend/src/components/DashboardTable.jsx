import { memo, useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { EmptyState } from '@/components/ui/empty-state';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDeviceMode } from '@/hooks/useDeviceMode';
import { cn } from '@/lib/utils';
import TableSkeleton from './TableSkeleton';
import MobileCardView from './MobileCardView';

/** Desktop table: virtualize row DOM when a page has many rows (e.g. page size 50–100). */
const ROW_VIRTUALIZE_MIN = 25;
const ROW_ESTIMATE_PX = 56;

/** Column header text — pages may use `label` or `title` (e.g. Products). */
function columnHeaderText(column) {
  if (!column) return '';
  return column.label ?? column.title ?? column.key ?? '';
}

/** Columns visible in this viewport (matches MobileCardView hidden-column behavior). */
function getVisibleColumns(columns) {
  return (columns || []).filter((col) => !col.hidden);
}

/**
 * Grid-based virtualized list (same columns as classic table; avoids broken table+absolute tr layout).
 */
function DashboardVirtualizedGrid({ scrollRef, paginatedData, columns, scrollResetKey }) {
  const gridTemplateColumns = useMemo(
    () =>
      columns
        .map((c) => (typeof c.width === 'string' && c.width.trim() ? c.width : 'minmax(0,1fr)'))
        .join(' '),
    [columns]
  );

  const rowVirtualizer = useVirtualizer({
    count: paginatedData.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 8,
    measureElement:
      typeof document !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !/Firefox\//.test(navigator.userAgent)
        ? (el) => el?.getBoundingClientRect().height ?? ROW_ESTIMATE_PX
        : undefined,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [scrollResetKey, scrollRef]);

  return (
    <div className="min-w-[720px]">
      <div
        className="sticky top-0 z-[1] grid gap-0 border-b bg-card text-sm font-medium text-muted-foreground"
        style={{ gridTemplateColumns }}
        role="rowgroup"
      >
        {columns.map((column) => (
          <div
            key={column.key}
            role="columnheader"
            className={cn('h-12 px-4 flex items-center border-b border-border', column.headerClassName)}
          >
            {columnHeaderText(column)}
          </div>
        ))}
      </div>
      <div
        role="rowgroup"
        className="relative w-full"
        style={{ height: rowVirtualizer.getTotalSize() }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = paginatedData[virtualRow.index];
          const index = virtualRow.index;
          return (
            <div
              key={item.id != null ? String(item.id) : item.key != null ? String(item.key) : `row-${virtualRow.key}`}
              role="row"
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 grid w-full border-b border-border transition-colors hover:bg-muted/50"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns,
                height: `${virtualRow.size}px`,
              }}
            >
              {columns.map((column) => (
                <div
                  key={column.key}
                  role="cell"
                  className={cn('flex min-w-0 items-center p-4 align-middle text-sm', column.cellClassName)}
                >
                  <div className="min-w-0 flex-1">
                    {column.render
                      ? column.render(item[column.key], item, index)
                      : item[column.key] !== undefined && item[column.key] !== null
                        ? item[column.key]
                        : '—'}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * DashboardTable - Generic reusable table component for dashboard
 * Shows table on desktop/tablet, cards on mobile
 * @param {Array} data - Array of data objects
 * @param {Array} columns - Array of column definitions with { key, label, render }
 * @param {boolean} loading - Loading state
 * @param {string} title - Table title
 * @param {Object} emptyState - EmptyState config { icon, imageKey, title, description, primaryAction, secondaryAction }
 * @param {React.ReactNode} emptyIcon - (Legacy) Icon to show when empty
 * @param {string} emptyDescription - (Legacy) Description text when empty
 * @param {string} emptyTitle - (Legacy) Title text when empty
 * @param {React.ReactNode} emptyAction - Optional action button/content to show when empty
 * @param {number} pageSize - Number of items per page (default: 10)
 * @param {Function} onPageChange - Callback when page changes (optional, for external pagination)
 * @param {Object} externalPagination - External pagination state { current, total } (optional)
 * @param {Function} onCardClick - Optional callback when card is clicked (mobile only)
 * @param {string} viewMode - 'table' (list) | 'grid' (cards). With onViewModeChange: list shows column headers; grid uses MobileCardView (no header row).
 * @param {Function} onViewModeChange - When provided, mobile respects viewMode (list = table + headers; grid = cards). When omitted, mobile always uses cards (legacy).
 * @param {Function} getCardImage - Optional function(record) => imageUrl for card thumbnail in grid/card view
 * @param {Object|null} infinite - From usePagedList: on phones/tablets the cards load more on scroll instead of paging
 */
const DashboardTable = memo(({
  data = [],
  columns = [],
  loading = false,
  title = 'Table',
  emptyState,
  emptyIcon,
  emptyDescription = 'No items found',
  emptyTitle,
  emptyAction,
  pageSize = 10,
  onPageChange,
  externalPagination,
  onCardClick,
  viewMode: controlledViewMode,
  onViewModeChange,
  getCardImage,
  infinite = null,
}) => {
  // Cards wherever the app-style layout is used (phones and tablets) — matches MainLayout.
  const { isAppShell: isMobile } = useDeviceMode();
  const [internalPagination, setInternalPagination] = useState({ current: 1, pageSize });
  const [internalViewMode, setInternalViewMode] = useState('table');
  const viewMode = onViewModeChange ? (controlledViewMode ?? 'table') : internalViewMode;
  const setViewMode = onViewModeChange || setInternalViewMode;
  
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
  
  const paginatedData = useMemo(() => {
    if (externalPagination) {
      // External pagination - data is already paginated
      return data;
    }
    // Internal pagination - slice the data
    return data.slice(
      (pagination.current - 1) * effectivePageSize,
      pagination.current * effectivePageSize
    );
  }, [data, pagination.current, effectivePageSize, externalPagination]);

  const handlePageChange = useCallback((newPage) => {
    setPagination(prev => ({ ...prev, current: newPage, pageSize }));
  }, [pageSize, setPagination]);

  const tableScrollRef = useRef(null);
  const useVirtualRows = paginatedData.length >= ROW_VIRTUALIZE_MIN;

  const visibleColumns = useMemo(() => getVisibleColumns(columns), [columns]);

  // Mobile always uses cards for responsiveness.
  // Desktop/tablet can still switch between list/table and grid/card via view mode.
  const useCardView = isMobile || viewMode === 'grid';

  if (useCardView) {
    return (
      <div>
        {title !== null && title !== undefined && title !== '' && (
          <h2 className={cn("text-lg font-semibold", isMobile ? "mb-2 px-0" : "mb-4 px-1")}>{title}</h2>
        )}
        <MobileCardView
          data={data}
          columns={visibleColumns}
          loading={loading}
          emptyState={emptyState}
          emptyIcon={emptyIcon}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyAction={emptyAction}
          pageSize={pageSize}
          onPageChange={onPageChange}
          externalPagination={externalPagination}
          onCardClick={onCardClick}
          gridLayout={viewMode === 'grid'}
          getCardImage={getCardImage}
          infinite={infinite}
        />
      </div>
    );
  }

  // On desktop/tablet, use table view
  return (
    <Card className={cn(!isMobile && "mt-6")}>
      {title !== null && title !== undefined && title !== '' && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? undefined : "pt-6"}>
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={pageSize} cols={visibleColumns.length || columns.length || 6} />
          </div>
        ) : !loading && data.length === 0 ? (
          <div className={cn(
            "flex w-full items-center justify-center p-4 sm:p-8",
            isMobile && "min-h-[min(50dvh,28rem)]"
          )}>
            {emptyState ? (
              <EmptyState
                className={cn(isMobile && "w-full max-w-md py-8")}
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
        ) : (
          <>
            {useVirtualRows ? (
              <div className="-mx-6 w-[calc(100%+3rem)] border-b">
                <div
                  ref={tableScrollRef}
                  className="max-h-[min(70vh,560px)] overflow-auto"
                >
                  <DashboardVirtualizedGrid
                    scrollRef={tableScrollRef}
                    paginatedData={paginatedData}
                    columns={visibleColumns}
                    scrollResetKey={`${pagination.current}-${effectivePageSize}`}
                  />
                </div>
              </div>
            ) : (
              <div className="-mx-6 w-[calc(100%+3rem)] overflow-x-auto border-b">
                <table className="min-w-[720px] w-full min-w-full caption-bottom text-sm border-collapse [&_tr]:border-b">
                  <thead className="[&_tr]:border-b bg-muted/30">
                    <tr className="border-b transition-colors">
                      {visibleColumns.map((column) => (
                        <th
                          key={column.key}
                          className={cn('h-12 px-4 text-left align-middle font-medium text-muted-foreground', column.headerClassName)}
                          style={column.width ? { width: column.width, minWidth: column.width } : undefined}
                        >
                          {columnHeaderText(column)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {paginatedData.map((item, index) => (
                      <tr key={item.id || item.key || index} className="border-b transition-colors hover:bg-muted/50 last:border-b-0">
                        {visibleColumns.map((column) => (
                          <td
                            key={column.key}
                            className={cn('p-4 align-middle', column.cellClassName)}
                            style={column.width ? { width: column.width, minWidth: column.width } : undefined}
                          >
                            {column.render ? column.render(item[column.key], item, index) : (item[column.key] !== undefined && item[column.key] !== null ? item[column.key] : '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalItems > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3 rounded-b-md">
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
        )}
      </CardContent>
    </Card>
  );
});

DashboardTable.displayName = 'DashboardTable';

export default DashboardTable;
