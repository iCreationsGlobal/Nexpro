import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import rentalService from '../services/rentalService';
import { showError } from '../utils/toast';
import {
  CALENDAR_LEGEND,
  getCalendarEventStyle,
  getMonthGridRange,
  getWeekRange,
  groupEventsByDay,
  WEEKDAY_LABELS,
} from '../utils/rentalCalendarUtils';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAX_EVENTS_PER_DAY = 3;

/**
 * Branch-scoped rental + pre-booking calendar (month and week views).
 * @param {{ branchId?: string|null, onRentalClick: Function, onPreBookingClick: Function }} props
 */
const RentalCalendarView = ({ branchId, onRentalClick, onPreBookingClick }) => {
  const [viewMode, setViewMode] = useState('month');
  const [anchorDate, setAnchorDate] = useState(() => dayjs());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const visibleRange = useMemo(
    () => (viewMode === 'week' ? getWeekRange(anchorDate) : getMonthGridRange(anchorDate)),
    [anchorDate, viewMode]
  );

  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);

  const fetchCalendar = useCallback(
    async (isRefresh = false) => {
      if (!branchId) {
        setEvents([]);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const response = await rentalService.getCalendar({
          start: visibleRange.start,
          end: visibleRange.end,
          branchId,
        });
        const list = Array.isArray(response?.data) ? response.data : [];
        setEvents(list);
      } catch (error) {
        console.error('Failed to load rental calendar', error);
        showError(error, 'Failed to load calendar');
        setEvents([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [branchId, visibleRange.start, visibleRange.end]
  );

  useEffect(() => {
    void fetchCalendar();
  }, [fetchCalendar]);

  const handlePrev = useCallback(() => {
    setAnchorDate((prev) =>
      viewMode === 'week' ? prev.subtract(1, 'week') : prev.subtract(1, 'month')
    );
  }, [viewMode]);

  const handleNext = useCallback(() => {
    setAnchorDate((prev) =>
      viewMode === 'week' ? prev.add(1, 'week') : prev.add(1, 'month')
    );
  }, [viewMode]);

  const handleToday = useCallback(() => {
    setAnchorDate(dayjs());
  }, []);

  const handleEventClick = useCallback(
    (event) => {
      if (event.type === 'pre-booking') {
        onPreBookingClick?.(event.raw || { id: event.id });
        return;
      }
      onRentalClick?.(event.raw || { id: event.id });
    },
    [onPreBookingClick, onRentalClick]
  );

  const headerLabel = useMemo(() => {
    if (viewMode === 'week') {
      const start = dayjs(visibleRange.start);
      const end = dayjs(visibleRange.end);
      if (start.month() === end.month()) {
        return `${start.format('MMM D')} – ${end.format('D, YYYY')}`;
      }
      return `${start.format('MMM D')} – ${end.format('MMM D, YYYY')}`;
    }
    return anchorDate.format('MMMM YYYY');
  }, [anchorDate, viewMode, visibleRange.end, visibleRange.start]);

  const renderEventChip = (event, dayKey) => (
    <button
      key={`${dayKey}-${event.type}-${event.id}`}
      type="button"
      onClick={() => handleEventClick(event)}
      className={cn(
        'w-full text-left rounded px-1.5 py-0.5 text-xs truncate transition-colors',
        getCalendarEventStyle(event)
      )}
      title={event.title}
    >
      {event.type === 'pre-booking' ? 'Pre: ' : ''}
      {event.customerName || event.title}
    </button>
  );

  const renderMonthGrid = () => (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-muted/40">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-xs font-medium text-muted-foreground text-center"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {visibleRange.days.map((day) => {
          const key = day.format('YYYY-MM-DD');
          const dayEvents = eventsByDay.get(key) || [];
          const isCurrentMonth = day.month() === anchorDate.month();
          const isToday = day.isSame(dayjs(), 'day');
          const hiddenCount = Math.max(0, dayEvents.length - MAX_EVENTS_PER_DAY);

          return (
            <div
              key={key}
              className={cn(
                'min-h-[110px] border-b border-r border-gray-200 p-1.5 flex flex-col gap-1',
                !isCurrentMonth && 'bg-muted/20',
                isToday && 'bg-green-50/60'
              )}
            >
              <div
                className={cn(
                  'text-xs font-medium mb-0.5',
                  isToday ? 'text-green-800' : isCurrentMonth ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {day.format('D')}
              </div>
              <div className="space-y-1 flex-1">
                {dayEvents.slice(0, MAX_EVENTS_PER_DAY).map((event) => renderEventChip(event, key))}
                {hiddenCount > 0 ? (
                  <div className="text-[10px] text-muted-foreground px-1">
                    +{hiddenCount} more
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderWeekGrid = () => (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-muted/40">
        {visibleRange.days.map((day) => {
          const isToday = day.isSame(dayjs(), 'day');
          return (
            <div
              key={day.format('YYYY-MM-DD')}
              className={cn(
                'px-2 py-2 text-center border-r border-gray-200 last:border-r-0',
                isToday && 'bg-green-50/60'
              )}
            >
              <div className="text-xs text-muted-foreground">{day.format('ddd')}</div>
              <div className={cn('text-sm font-medium', isToday && 'text-green-800')}>
                {day.format('D')}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[420px]">
        {visibleRange.days.map((day) => {
          const key = day.format('YYYY-MM-DD');
          const dayEvents = eventsByDay.get(key) || [];
          const isToday = day.isSame(dayjs(), 'day');

          return (
            <div
              key={key}
              className={cn(
                'border-r border-gray-200 last:border-r-0 p-2 space-y-1.5',
                isToday && 'bg-green-50/40'
              )}
            >
              {dayEvents.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No events</p>
              ) : (
                dayEvents.map((event) => (
                  <div key={`${key}-${event.type}-${event.id}`} className="space-y-0.5">
                    {renderEventChip(event, key)}
                    <p className="text-[10px] text-muted-foreground truncate px-1">
                      {event.productSummary}
                    </p>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrev} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNext} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <h2 className="text-base font-semibold ml-1">{headerLabel}</h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-md border border-gray-200 p-0.5">
            <Button
              type="button"
              variant={viewMode === 'month' ? 'default' : 'ghost'}
              size="sm"
              className="h-8"
              onClick={() => setViewMode('month')}
            >
              Month
            </Button>
            <Button
              type="button"
              variant={viewMode === 'week' ? 'default' : 'ghost'}
              size="sm"
              className="h-8"
              onClick={() => setViewMode('week')}
            >
              Week
            </Button>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchCalendar(true)}
            disabled={refreshing || loading}
            aria-label="Refresh calendar"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {CALENDAR_LEGEND.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                'inline-block h-3 w-3 rounded-sm border',
                getCalendarEventStyle(
                  item.key === 'pre-booking'
                    ? { type: 'pre-booking', status: 'pending' }
                    : { type: 'rental', status: item.key }
                )
              )}
            />
            {item.label}
          </div>
        ))}
      </div>

      {!branchId ? (
        <div className="rounded-lg border border-gray-200 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          No branch is configured yet. Complete workspace setup or add a location to view the rental calendar.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading calendar…
        </div>
      ) : viewMode === 'week' ? (
        renderWeekGrid()
      ) : (
        renderMonthGrid()
      )}
    </div>
  );
};

export default RentalCalendarView;
