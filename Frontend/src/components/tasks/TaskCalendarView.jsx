import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDueState, toDateKey } from '../../utils/taskHelpers';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Month calendar of tasks by dueDate.
 */
export default function TaskCalendarView({
  tasks = [],
  monthDate,
  onMonthChange,
  onSelectTask,
  onSelectDay,
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();

  const { cells, label, undated } = useMemo(() => {
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const byDay = new Map();
    const undatedTasks = [];

    for (const task of tasks) {
      if (!task?.dueDate) {
        undatedTasks.push(task);
        continue;
      }
      const key = String(task.dueDate).slice(0, 10);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(task);
    }

    const grid = [];
    for (let i = 0; i < startPad; i += 1) {
      grid.push({ key: `pad-${i}`, day: null, dateKey: null, tasks: [] });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = toDateKey(new Date(year, month, day));
      grid.push({
        key: dateKey,
        day,
        dateKey,
        tasks: byDay.get(dateKey) || [],
      });
    }
    while (grid.length % 7 !== 0) {
      grid.push({ key: `trail-${grid.length}`, day: null, dateKey: null, tasks: [] });
    }

    return {
      cells: grid,
      label: first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      undated: undatedTasks,
    };
  }, [tasks, year, month]);

  const todayKey = toDateKey(new Date());

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="text-base">{label}</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Previous month"
              onClick={() => onMonthChange?.(new Date(year, month - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onMonthChange?.(new Date())}
            >
              Today
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Next month"
              onClick={() => onMonthChange?.(new Date(year, month + 1, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-2">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              if (!cell.day) {
                return <div key={cell.key} className="min-h-[88px] rounded-md border border-transparent bg-muted/20" />;
              }
              const isToday = cell.dateKey === todayKey;
              return (
                <button
                  key={cell.key}
                  type="button"
                  className={`min-h-[88px] rounded-md border border-border p-1.5 text-left hover:bg-muted/40 ${
                    isToday ? 'border-primary/50 bg-primary/5' : 'bg-card'
                  }`}
                  onClick={() => onSelectDay?.(cell.dateKey)}
                >
                  <div className="mb-1 text-xs font-medium text-foreground">{cell.day}</div>
                  <div className="space-y-1">
                    {cell.tasks.slice(0, 3).map((task) => {
                      const dueState = getDueState(task);
                      return (
                        <button
                          key={task.id}
                          type="button"
                          className={`block w-full truncate rounded px-1 py-0.5 text-[10px] text-left ${
                            dueState === 'overdue'
                              ? 'bg-destructive/10 text-destructive'
                              : dueState === 'today'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-muted text-foreground'
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectTask?.(task.id);
                          }}
                        >
                          {task.title}
                        </button>
                      );
                    })}
                    {cell.tasks.length > 3 ? (
                      <p className="text-[10px] text-muted-foreground">+{cell.tasks.length - 3} more</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Undated ({undated.length})</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[520px] space-y-2 overflow-y-auto">
          {undated.length === 0 ? (
            <p className="text-sm text-muted-foreground">No undated tasks</p>
          ) : (
            undated.map((task) => (
              <button
                key={task.id}
                type="button"
                className="w-full rounded-md border border-border p-2 text-left hover:bg-muted/40"
                onClick={() => onSelectTask?.(task.id)}
              >
                <p className="text-sm font-medium truncate">{task.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {task.assignee?.name || 'Unassigned'}
                </p>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
