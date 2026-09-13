import { CheckSquare, Flag } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { resolveImageUrl } from '../../utils/fileUtils';
import {
  SOURCE_LABEL,
  getChecklistProgress,
  getDueLabel,
  getDueState,
  getInitials,
  getTaskSourceHref,
  normalizeTaskTags,
} from '../../utils/taskHelpers';
import { PRIORITY_CHIP_CLASSES, STATUS_CHIP_CLASSES, STATUS_CHIP_DEFAULT_CLASS } from '../../constants';

const getPriorityChipClass = (priority = 'medium') =>
  PRIORITY_CHIP_CLASSES[priority] || PRIORITY_CHIP_CLASSES.medium;

const getSourceChipClass = (source = 'manual') =>
  STATUS_CHIP_CLASSES[`task_source_${source}`] || STATUS_CHIP_CLASSES.task_source_manual || STATUS_CHIP_DEFAULT_CLASS;

const DUE_TEXT_CLASS = {
  overdue: 'text-destructive',
  today: 'text-amber-700',
  soon: 'text-amber-600',
  none: 'text-muted-foreground',
};

const PRIORITY_FLAG_CLASS = {
  urgent: 'text-red-600',
  high: 'text-orange-500',
  medium: 'text-blue-500',
  low: 'text-muted-foreground',
};

/**
 * Compact task card for Kanban (and reusable list density).
 */
export default function TaskBoardCard({ task, onOpen, dragHandleProps = {}, className = '' }) {
  const dueState = getDueState(task);
  const dueLabel = getDueLabel(task);
  const sourceHref = getTaskSourceHref(task);
  const progress = getChecklistProgress(task);
  const tags = normalizeTaskTags(task);
  const assigneeName = task.assignee?.name || 'Unassigned';
  const avatarUrl = resolveImageUrl(task.assignee?.profilePicture || '') || undefined;
  const priority = task.priority || 'medium';

  return (
    <div
      role="button"
      tabIndex={0}
      {...dragHandleProps}
      onClick={() => onOpen?.(task.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen?.(task.id);
        }
      }}
      className={`w-full cursor-pointer rounded-md border border-border bg-card p-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${className}`}
    >
      <div className="flex items-start gap-2">
        <Flag className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${PRIORITY_FLAG_CLASS[priority] || PRIORITY_FLAG_CLASS.medium}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-foreground">{task.title}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar className="h-6 w-6" title={assigneeName}>
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={assigneeName} /> : null}
                <AvatarFallback className="text-[10px]">{getInitials(assigneeName)}</AvatarFallback>
              </Avatar>
              <span className={`truncate text-[11px] ${DUE_TEXT_CLASS[dueState] || DUE_TEXT_CLASS.none}`}>
                {dueLabel}
              </span>
            </div>
            {progress ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                <CheckSquare className="h-3 w-3" />
                {progress.done}/{progress.total}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {task.sourceType ? (
              sourceHref ? (
                <Link
                  to={sourceHref}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex"
                >
                  <Badge
                    variant="outline"
                    className={`text-[10px] hover:underline ${getSourceChipClass(task.sourceType)}`}
                  >
                    {SOURCE_LABEL[task.sourceType] || task.sourceType}
                  </Badge>
                </Link>
              ) : (
                <Badge variant="outline" className={`text-[10px] ${getSourceChipClass(task.sourceType)}`}>
                  {SOURCE_LABEL[task.sourceType] || task.sourceType}
                </Badge>
              )
            ) : null}
            {task.isPrivate ? (
              <Badge variant="outline" className="text-[10px]">
                Private
              </Badge>
            ) : null}
            <Badge variant="outline" className={`text-[10px] ${getPriorityChipClass(priority)}`}>
              {String(priority).toUpperCase()}
            </Badge>
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
