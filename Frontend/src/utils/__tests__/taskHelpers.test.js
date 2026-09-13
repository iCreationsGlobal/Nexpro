/**
 * Unit tests for taskHelpers (source links, due labels, sort/group).
 */
import { describe, expect, test } from 'vitest';
import {
  getTaskSourceHref,
  getTaskProvenance,
  getDueState,
  getDueLabel,
  normalizeTaskChecklists,
  normalizeTaskTags,
  normalizeTagInput,
  sortTasks,
  groupTasks,
} from '../taskHelpers';

describe('taskHelpers', () => {
  test('getTaskSourceHref builds deep links by source type', () => {
    expect(getTaskSourceHref({ sourceType: 'invoice', sourceId: 'inv-1' })).toBe(
      '/invoices?openInvoiceId=inv-1'
    );
    expect(getTaskSourceHref({ sourceType: 'lead', sourceId: 'lead-1' })).toBe(
      '/leads?openLeadId=lead-1'
    );
    expect(getTaskSourceHref({ sourceType: 'quote', sourceId: 'q-1' })).toBe(
      '/quotes?openQuoteId=q-1'
    );
    expect(getTaskSourceHref({ sourceType: 'stock', sourceId: 's-1' })).toBe(
      '/materials?openItemId=s-1'
    );
    expect(getTaskSourceHref({ metadata: { link: '/custom/path' } })).toBe('/custom/path');
  });

  test('getTaskProvenance prefers metadata.reason', () => {
    expect(
      getTaskProvenance({
        sourceType: 'invoice',
        sourceEvent: 'overdue_follow_up',
        metadata: { reason: 'Custom reason' },
      })
    ).toBe('Custom reason');
    expect(
      getTaskProvenance({ sourceType: 'invoice', sourceEvent: 'overdue_follow_up' })
    ).toBe('Invoice is overdue');
  });

  test('getDueState and getDueLabel handle overdue/today', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(getDueState({ dueDate: today, status: 'todo' })).toBe('today');
    expect(getDueLabel({ dueDate: today, status: 'todo' })).toBe('Due today');
    expect(getDueState({ dueDate: '2000-01-01', status: 'todo' })).toBe('overdue');
    expect(getDueLabel({ dueDate: '2000-01-01', status: 'todo' })).toMatch(/^Overdue/);
  });

  test('normalize checklist and tags', () => {
    expect(
      normalizeTaskChecklists({
        metadata: { checklists: [{ id: '1', text: 'Do thing', done: true }] },
      })
    ).toEqual([{ id: '1', text: 'Do thing', done: true, createdAt: null }]);
    expect(normalizeTagInput('  Follow Up ')).toBe('follow-up');
    expect(normalizeTaskTags({ metadata: { tags: ['A', 'a', 'b'] } })).toEqual(['a', 'b']);
  });

  test('sortTasks and groupTasks', () => {
    const tasks = [
      { id: '1', title: 'B', priority: 'low', createdAt: '2026-01-02', assigneeId: null },
      {
        id: '2',
        title: 'A',
        priority: 'urgent',
        createdAt: '2026-01-01',
        assignee: { name: 'Sam' },
        assigneeId: 'u1',
      },
    ];
    expect(sortTasks(tasks, 'title').map((t) => t.id)).toEqual(['2', '1']);
    expect(sortTasks(tasks, 'priority').map((t) => t.id)).toEqual(['2', '1']);
    const groups = groupTasks(tasks, 'assignee');
    expect(groups.map((g) => g.key).sort()).toEqual(['u1', 'unassigned'].sort());
  });
});
