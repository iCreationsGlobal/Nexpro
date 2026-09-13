/**
 * Task board helpers for source links, due labels, checklists, and tags.
 */

export const SOURCE_EVENT_REASON = {
  follow_up: 'Lead follow-up is due',
  overdue_follow_up: 'Invoice is overdue',
  no_response_follow_up: 'Quote has had no response',
  low_stock_restock: 'Stock is below reorder level',
};

export const SOURCE_LABEL = {
  lead: 'Lead follow-up',
  invoice: 'Invoice collection',
  quote: 'Quote follow-up',
  stock: 'Restock',
};

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * @param {object} task
 * @returns {string|null}
 */
export function getTaskSourceHref(task) {
  if (!task) return null;
  const metaLink = typeof task.metadata?.link === 'string' ? task.metadata.link.trim() : '';
  if (metaLink && metaLink.startsWith('/') && /[?&]/.test(metaLink)) {
    return metaLink;
  }

  const id = task.sourceId ? String(task.sourceId) : '';
  switch (task.sourceType) {
    case 'lead':
      return id ? `/leads?openLeadId=${encodeURIComponent(id)}` : '/leads';
    case 'invoice':
      return id ? `/invoices?openInvoiceId=${encodeURIComponent(id)}` : '/invoices';
    case 'quote':
      return id ? `/quotes?openQuoteId=${encodeURIComponent(id)}` : '/quotes';
    case 'stock':
      return id ? `/materials?openItemId=${encodeURIComponent(id)}` : '/materials';
    default:
      break;
  }

  if (metaLink && metaLink.startsWith('/')) return metaLink;
  return null;
}

/**
 * @param {object} task
 * @returns {string|null}
 */
export function getTaskProvenance(task) {
  if (!task?.sourceType && !task?.sourceEvent && !task?.metadata?.reason) return null;
  if (task.metadata?.reason && String(task.metadata.reason).trim()) {
    return String(task.metadata.reason).trim();
  }
  if (task.sourceEvent && SOURCE_EVENT_REASON[task.sourceEvent]) {
    return SOURCE_EVENT_REASON[task.sourceEvent];
  }
  if (task.sourceType && SOURCE_LABEL[task.sourceType]) {
    return `Created from ${SOURCE_LABEL[task.sourceType].toLowerCase()}`;
  }
  return null;
}

/**
 * @param {object} task
 * @returns {'overdue'|'today'|'soon'|'none'}
 */
export function getDueState(task) {
  if (!task?.dueDate) return 'none';
  const today = new Date().toISOString().slice(0, 10);
  const due = String(task.dueDate).slice(0, 10);
  if (task.status === 'completed') return 'none';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  const dueTs = new Date(`${due}T00:00:00`).getTime();
  const todayTs = new Date(`${today}T00:00:00`).getTime();
  const diffDays = Math.floor((dueTs - todayTs) / (1000 * 60 * 60 * 24));
  if (diffDays <= 2) return 'soon';
  return 'none';
}

/**
 * @param {object} task
 * @returns {string}
 */
export function getDueLabel(task) {
  if (!task?.dueDate) return 'No due date';
  const state = getDueState(task);
  const absolute = formatTaskDate(task.dueDate);
  if (task.status === 'completed') return absolute;
  if (state === 'overdue') {
    const today = new Date().toISOString().slice(0, 10);
    const due = String(task.dueDate).slice(0, 10);
    const days = Math.floor(
      (new Date(`${today}T00:00:00`).getTime() - new Date(`${due}T00:00:00`).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (days === 1) return 'Overdue · 1 day';
    return `Overdue · ${days} days`;
  }
  if (state === 'today') return 'Due today';
  if (state === 'soon') {
    const today = new Date().toISOString().slice(0, 10);
    const due = String(task.dueDate).slice(0, 10);
    const days = Math.floor(
      (new Date(`${due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    return days === 1 ? 'Due tomorrow' : `In ${days} days`;
  }
  return absolute;
}

/**
 * @param {string|Date|null|undefined} value
 * @returns {string}
 */
export function formatTaskDate(value) {
  if (!value) return 'No due date';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'No due date';
  return d.toLocaleDateString();
}

/**
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function getInitials(name) {
  const value = String(name || '').trim();
  if (!value) return 'U';
  return (
    value
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'U'
  );
}

/**
 * @param {object} task
 * @returns {{ id: string, text: string, done: boolean, createdAt?: string }[]}
 */
export function normalizeTaskChecklists(task) {
  const raw = task?.metadata?.checklists;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      id: String(item.id || `cl_${index}`),
      text: String(item.text || '').trim(),
      done: Boolean(item.done),
      createdAt: item.createdAt || null,
    }))
    .filter((item) => item.text);
}

/**
 * @param {object} task
 * @returns {{ done: number, total: number }|null}
 */
export function getChecklistProgress(task) {
  const items = normalizeTaskChecklists(task);
  if (!items.length) return null;
  return {
    done: items.filter((item) => item.done).length,
    total: items.length,
  };
}

/**
 * @param {object} task
 * @returns {string[]}
 */
export function normalizeTaskTags(task) {
  const raw = task?.metadata?.tags;
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const tags = [];
  for (const value of raw) {
    const tag = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= 5) break;
  }
  return tags;
}

/**
 * @param {string} tag
 * @returns {string}
 */
export function normalizeTagInput(tag) {
  return String(tag || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 32);
}

/**
 * @param {object[]} tasks
 * @param {string} sortBy
 * @returns {object[]}
 */
export function sortTasks(tasks, sortBy = 'created_desc') {
  const list = [...(tasks || [])];
  const dueValue = (task) => {
    if (!task?.dueDate) return Number.POSITIVE_INFINITY;
    return new Date(`${String(task.dueDate).slice(0, 10)}T00:00:00`).getTime();
  };
  const createdValue = (task) => new Date(task.createdAt || 0).getTime();

  switch (sortBy) {
    case 'due_asc':
      return list.sort((a, b) => dueValue(a) - dueValue(b) || createdValue(b) - createdValue(a));
    case 'due_desc':
      return list.sort((a, b) => dueValue(b) - dueValue(a) || createdValue(b) - createdValue(a));
    case 'priority':
      return list.sort((a, b) => {
        const pa = PRIORITY_RANK[a.priority || 'medium'] ?? 2;
        const pb = PRIORITY_RANK[b.priority || 'medium'] ?? 2;
        return pa - pb || createdValue(b) - createdValue(a);
      });
    case 'title':
      return list.sort((a, b) =>
        String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' })
      );
    case 'created_asc':
      return list.sort((a, b) => createdValue(a) - createdValue(b));
    case 'created_desc':
    default:
      return list.sort((a, b) => createdValue(b) - createdValue(a));
  }
}

/**
 * @param {object[]} tasks
 * @param {string} groupBy
 * @returns {{ key: string, label: string, tasks: object[] }[]}
 */
export function groupTasks(tasks, groupBy = 'none') {
  if (!groupBy || groupBy === 'none') {
    return [{ key: 'all', label: 'All tasks', tasks }];
  }

  const buckets = new Map();
  const ensure = (key, label) => {
    if (!buckets.has(key)) buckets.set(key, { key, label, tasks: [] });
    return buckets.get(key);
  };

  for (const task of tasks) {
    if (groupBy === 'assignee') {
      const key = task.assigneeId || 'unassigned';
      const label = task.assignee?.name || 'Unassigned';
      ensure(key, label).tasks.push(task);
    } else if (groupBy === 'priority') {
      const key = task.priority || 'medium';
      ensure(key, String(key).toUpperCase()).tasks.push(task);
    } else if (groupBy === 'source') {
      const key = task.sourceType || 'manual';
      const label = SOURCE_LABEL[key] || (key === 'manual' ? 'Manual' : key);
      ensure(key, label).tasks.push(task);
    } else if (groupBy === 'tag') {
      const tags = normalizeTaskTags(task);
      if (!tags.length) {
        ensure('untagged', 'Untagged').tasks.push(task);
      } else {
        tags.forEach((tag) => ensure(tag, tag).tasks.push(task));
      }
    } else {
      ensure('all', 'All tasks').tasks.push(task);
    }
  }

  return Array.from(buckets.values());
}

/**
 * @param {Date} date
 * @returns {string} YYYY-MM-DD
 */
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
