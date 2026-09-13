import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ACTION_CONTENT,
  buildRulePayloadFromForm,
  buildScheduleConfigFromForm,
  buildTestRecipientContext,
  conditionFormFromConfig,
  defaultActionFormRow,
  defaultDelayMinutesForTrigger,
  defaultFrequencyForTrigger,
  formatPlaceholderHint,
  getEventTimingCopy,
  getReviewAdditionalSettingsLines,
  getWhatHappensNextTiming,
  isInternalStaffTrigger,
  isStaffAutomationAudience,
  isStickyTrigger,
  prefillActionRow,
  prefillActionRows,
  resolveAutomationBranchLabel,
  scheduleFormFromConfig,
  supportsSendAfter,
  usesDailySchedule,
  findDuplicateAutomationRule,
  describeAutomationDuplicateConflict,
} from '../../utils/automationForm';

describe('findDuplicateAutomationRule', () => {
  const existing = [
    {
      id: 'rule-1',
      name: 'Birthday greeting',
      triggerType: 'customer_birthday',
      shopId: null,
      studioLocationId: null,
      actionConfig: { actions: [{ type: 'send_email_platform', subject: 'Happy birthday' }] },
    },
  ];

  it('flags same birthday trigger + email channel', () => {
    const duplicate = findDuplicateAutomationRule(existing, {
      triggerType: 'customer_birthday',
      shopId: null,
      studioLocationId: null,
      actionConfig: { actions: [{ type: 'send_email_platform', subject: 'Hi' }] },
    });
    expect(duplicate?.id).toBe('rule-1');
    expect(describeAutomationDuplicateConflict(duplicate, {
      triggerType: 'customer_birthday',
      actionConfig: { actions: [{ type: 'send_email_platform' }] },
    })).toMatch(/Birthday greeting/);
  });

  it('allows birthday + different channel', () => {
    const duplicate = findDuplicateAutomationRule(existing, {
      triggerType: 'customer_birthday',
      actionConfig: { actions: [{ type: 'send_whatsapp', templateName: 'birthday_greeting' }] },
    });
    expect(duplicate).toBeNull();
  });

  it('ignores the rule being edited', () => {
    const duplicate = findDuplicateAutomationRule(existing, {
      triggerType: 'customer_birthday',
      actionConfig: { actions: [{ type: 'send_email_platform' }] },
    }, { excludeRuleId: 'rule-1' });
    expect(duplicate).toBeNull();
  });

  it('ignores the rule being edited when ids differ only by case', () => {
    const withUuid = [{
      ...existing[0],
      id: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
    }];
    const duplicate = findDuplicateAutomationRule(withUuid, {
      triggerType: 'customer_birthday',
      actionConfig: { actions: [{ type: 'send_email_platform' }] },
    }, { excludeRuleId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
    expect(duplicate).toBeNull();
  });

  it('ignores candidate.id when excludeRuleId is omitted', () => {
    const duplicate = findDuplicateAutomationRule(existing, {
      id: 'rule-1',
      triggerType: 'customer_birthday',
      actionConfig: { actions: [{ type: 'send_email_platform' }] },
    });
    expect(duplicate).toBeNull();
  });

  it('still flags a different rule while editing', () => {
    const twoRules = [
      ...existing,
      {
        id: 'rule-2',
        name: 'Other birthday SMS',
        triggerType: 'customer_birthday',
        shopId: null,
        studioLocationId: null,
        actionConfig: { actions: [{ type: 'send_sms', body: 'Hi' }] },
      },
    ];
    const duplicate = findDuplicateAutomationRule(twoRules, {
      triggerType: 'customer_birthday',
      actionConfig: { actions: [{ type: 'send_sms' }] },
    }, { excludeRuleId: 'rule-2' });
    // email-only rule-1 is not an SMS duplicate
    expect(duplicate).toBeNull();

    const smsDup = findDuplicateAutomationRule([
      {
        id: 'rule-1',
        name: 'Birthday greeting',
        triggerType: 'customer_birthday',
        shopId: null,
        studioLocationId: null,
        actionConfig: { actions: [{ type: 'send_sms' }] },
      },
      {
        id: 'rule-2',
        name: 'Other birthday SMS',
        triggerType: 'customer_birthday',
        shopId: null,
        studioLocationId: null,
        actionConfig: { actions: [{ type: 'send_sms' }] },
      },
    ], {
      triggerType: 'customer_birthday',
      actionConfig: { actions: [{ type: 'send_sms' }] },
    }, { excludeRuleId: 'rule-2' });
    expect(smsDup?.id).toBe('rule-1');
  });
});

describe('automationForm action prefill', () => {
  it('prefills birthday SMS with placeholders when body is empty', () => {
    const row = defaultActionFormRow('send_sms', 'customer_birthday');
    expect(row.body).toContain('{{customerName}}');
    expect(row.body).toContain('{{businessName}}');
    expect(row.body).toMatch(/Happy birthday/i);
  });

  it('does not overwrite user-edited messaging fields', () => {
    const row = prefillActionRow(
      { type: 'send_sms', body: 'Custom message' },
      'customer_birthday'
    );
    expect(row.body).toBe('Custom message');
  });

  it('prefills only empty fields when trigger changes', () => {
    const rows = prefillActionRows(
      [
        { type: 'send_sms', body: 'Keep this' },
        { type: 'send_email_platform', subject: '', body: '' },
      ],
      'invoice_overdue'
    );
    expect(rows[0].body).toBe('Keep this');
    expect(rows[1].subject).toContain('{{invoiceNumber}}');
    expect(rows[1].body).toContain('{{paymentLink}}');
  });

  it('lists placeholders for the selected trigger', () => {
    expect(formatPlaceholderHint('customer_birthday')).toContain('{{customerName}}');
    expect(formatPlaceholderHint('low_stock_detected')).toContain('{{productName}}');
    expect(formatPlaceholderHint('review_request')).toContain('{{reviewLink}}');
  });

  it('lists placeholders for job completed and daily sales summary triggers', () => {
    expect(formatPlaceholderHint('job_completed')).toContain('{{trackingLink}}');
    expect(formatPlaceholderHint('daily_sales_summary')).toContain('{{totalSalesFormatted}}');
  });

  it('lists placeholders for order_created trigger', () => {
    expect(formatPlaceholderHint('order_created')).toContain('{{trackingLink}}');
    expect(formatPlaceholderHint('order_created')).toContain('{{orderNumber}}');
  });

  it('prefills order_created SMS with tracking link', () => {
    const row = defaultActionFormRow('send_sms', 'order_created');
    expect(row.body).toContain('{{trackingLink}}');
    expect(row.body).toContain('{{orderNumber}}');
    expect(row.body).not.toMatch(/ETA|ready in|minutes/i);
  });

  it('prefills job completed email with tracking line placeholder', () => {
    const row = defaultActionFormRow('send_email_platform', 'job_completed');
    expect(row.body).toContain('{{trackingLinkLine}}');
    expect(row.subject).toContain('{{jobNumber}}');
  });

  it('defines defaults for every supported trigger and messaging action', () => {
    const triggers = Object.keys(DEFAULT_ACTION_CONTENT);
    expect(triggers).toContain('customer_birthday');
    expect(triggers).toContain('invoice_overdue');
    expect(triggers).toContain('payment_received');
    expect(triggers).toContain('review_request');
    expect(triggers).toContain('job_completed');
    expect(triggers).toContain('daily_sales_summary');
    expect(triggers).toContain('job_due_in_hours');
    expect(triggers).toContain('rental_created');
    expect(triggers).toContain('rental_due_in_days');
    for (const triggerType of triggers) {
      const actions = DEFAULT_ACTION_CONTENT[triggerType];
      expect(Object.keys(actions).length).toBeGreaterThan(0);
      for (const [actionType, content] of Object.entries(actions)) {
        expect(content, `${triggerType}/${actionType}`).toBeTruthy();
      }
      // Some internal triggers are email/task only (no SMS/WhatsApp defaults)
      if (!['job_due_in_hours', 'task_assigned_staff', 'rental_created_staff', 'rental_returned_staff', 'rental_overdue_staff'].includes(triggerType)) {
        for (const actionType of ['send_sms', 'send_whatsapp', 'send_email_platform']) {
          expect(actions[actionType], `${triggerType}/${actionType}`).toBeTruthy();
        }
      }
    }
  });
});

describe('automationForm frequency / schedule', () => {
  it('marks sticky triggers and defaults overdue to weekly', () => {
    expect(isStickyTrigger('invoice_overdue')).toBe(true);
    expect(isStickyTrigger('rental_due_in_days')).toBe(true);
    expect(isStickyTrigger('rental_overdue')).toBe(true);
    expect(isStickyTrigger('payment_received')).toBe(false);
    expect(isStickyTrigger('rental_created')).toBe(false);
    expect(defaultFrequencyForTrigger('invoice_overdue')).toBe('weekly');
    expect(defaultFrequencyForTrigger('low_stock_detected')).toBe('daily');
  });

  it('maps frequency form fields to scheduleConfig cooldownHours / maxSends', () => {
    expect(buildScheduleConfigFromForm({ frequency: 'once' }, 'invoice_overdue')).toEqual({
      frequency: 'once',
      maxSends: 1,
    });
    expect(buildScheduleConfigFromForm({ frequency: 'daily' }, 'invoice_overdue')).toEqual({
      frequency: 'daily',
      cooldownHours: 24,
    });
    expect(buildScheduleConfigFromForm({ frequency: 'weekly' }, 'invoice_overdue')).toEqual({
      frequency: 'weekly',
      cooldownHours: 168,
    });
    expect(buildScheduleConfigFromForm({ frequency: 'monthly' }, 'invoice_overdue')).toEqual({
      frequency: 'monthly',
      cooldownHours: 720,
    });
    expect(buildScheduleConfigFromForm({ frequency: 'every_n_days', intervalDays: '5' }, 'quote_no_response')).toEqual({
      frequency: 'every_n_days',
      intervalDays: 5,
      cooldownHours: 120,
    });
  });

  it('lazily normalizes empty sticky schedule to daily (overdue weekly)', () => {
    expect(scheduleFormFromConfig({}, 'invoice_overdue').frequency).toBe('daily');
    expect(scheduleFormFromConfig({}, 'customer_inactive_days').frequency).toBe('daily');
    expect(conditionFormFromConfig({}, { frequency: 'weekly', cooldownHours: 168 }, 'invoice_overdue').frequency).toBe('weekly');
    expect(defaultFrequencyForTrigger('invoice_overdue')).toBe('weekly');
  });

  it('includes scheduleConfig in buildRulePayloadFromForm', () => {
    const payload = buildRulePayloadFromForm({
      name: 'Overdue weekly',
      triggerType: 'invoice_overdue',
      triggerForm: { daysAfterDue: 1 },
      conditionForm: { frequency: 'weekly', intervalDays: '1' },
      actionRows: [{ type: 'send_email_platform', subject: 'Overdue', body: 'Pay now' }],
    });
    expect(payload.scheduleConfig).toEqual({ frequency: 'weekly', cooldownHours: 168 });
  });
});

describe('automationForm Send after / delayMinutes', () => {
  it('supports Send after on event triggers only', () => {
    expect(supportsSendAfter('review_request')).toBe(true);
    expect(supportsSendAfter('payment_received')).toBe(true);
    expect(supportsSendAfter('job_completed')).toBe(true);
    expect(supportsSendAfter('invoice_overdue')).toBe(false);
    expect(supportsSendAfter('customer_birthday')).toBe(false);
    expect(supportsSendAfter('daily_sales_summary')).toBe(false);
  });

  it('defaults review_request to 60 minutes and transactional to 0', () => {
    expect(defaultDelayMinutesForTrigger('review_request')).toBe(60);
    expect(defaultDelayMinutesForTrigger('payment_received')).toBe(0);
    expect(defaultDelayMinutesForTrigger('invoice_sent')).toBe(0);
  });

  it('maps delayMinutes into scheduleConfig for event triggers', () => {
    expect(buildScheduleConfigFromForm({ delayMinutes: '60' }, 'review_request')).toEqual({
      delayMinutes: 60,
    });
    expect(buildScheduleConfigFromForm({ delayMinutes: '3', cooldownDays: '7' }, 'payment_received')).toEqual({
      cooldownHours: 168,
      delayMinutes: 3,
    });
    expect(buildScheduleConfigFromForm({ delayMinutes: '60' }, 'invoice_overdue')).toEqual({
      frequency: 'weekly',
      cooldownHours: 168,
    });
  });

  it('round-trips delayMinutes through scheduleFormFromConfig', () => {
    expect(scheduleFormFromConfig({ delayMinutes: 60, cooldownHours: 168 }, 'review_request')).toMatchObject({
      delayMinutes: '60',
      cooldownDays: '7',
    });
    expect(conditionFormFromConfig({}, { delayMinutes: 60 }, 'review_request').delayMinutes).toBe('60');
  });

  it('includes delayMinutes in buildRulePayloadFromForm for review_request', () => {
    const payload = buildRulePayloadFromForm({
      name: 'Ask for review',
      triggerType: 'review_request',
      triggerForm: {},
      conditionForm: { delayMinutes: '60' },
      actionRows: [{ type: 'send_sms', body: 'Please review {{businessName}}' }],
    });
    expect(payload.scheduleConfig).toEqual({ delayMinutes: 60 });
  });
});

describe('automationForm review timing copy', () => {
  it('uses event-based copy for job_created, not a daily 09:00 schedule', () => {
    expect(usesDailySchedule('job_created')).toBe(false);
    expect(getEventTimingCopy('job_created', {})).toBe('Runs immediately when a job is created');
    expect(getEventTimingCopy('job_created', { delayMinutes: '0' })).toBe('Runs immediately when a job is created');
    expect(getEventTimingCopy('job_created', { delayMinutes: '60' })).toBe('Runs 1 hour after a job is created');
    expect(getReviewAdditionalSettingsLines('job_created', {})).toEqual([
      'Runs immediately when a job is created',
    ]);
    expect(getWhatHappensNextTiming('job_created', {}).title).toBe(
      'It will run immediately when a job is created'
    );
  });

  it('keeps daily schedule copy for sticky/scheduler triggers', () => {
    expect(usesDailySchedule('daily_sales_summary')).toBe(true);
    expect(usesDailySchedule('invoice_overdue')).toBe(true);
    expect(getReviewAdditionalSettingsLines('daily_sales_summary', { runAfterTime: '06:00' })).toEqual([
      'Time zone: (GMT+00:00) Accra',
      'Runs every day at 06:00 AM',
    ]);
    expect(getWhatHappensNextTiming('invoice_due_in_days', {}).title).toBe(
      'It will run every day at 09:00 AM'
    );
  });
});

describe('resolveAutomationBranchLabel', () => {
  const branches = {
    shops: [{ id: 'shop-1', name: 'Downtown shop' }],
    studioLocations: [{ id: 'loc-1', name: 'Uptown studio' }],
  };

  it('returns "All branches" when both branch fields are unset', () => {
    expect(resolveAutomationBranchLabel({}, branches)).toBe('All branches');
    expect(resolveAutomationBranchLabel({ shopId: null, studioLocationId: null }, branches)).toBe('All branches');
  });

  it('resolves the shop name when shopId matches', () => {
    expect(resolveAutomationBranchLabel({ shopId: 'shop-1' }, branches)).toBe('Downtown shop');
  });

  it('resolves the studio location name when studioLocationId matches', () => {
    expect(resolveAutomationBranchLabel({ studioLocationId: 'loc-1' }, branches)).toBe('Uptown studio');
  });

  it('falls back to "Unknown branch" when the id has no match in the list', () => {
    expect(resolveAutomationBranchLabel({ shopId: 'shop-missing' }, branches)).toBe('Unknown branch');
    expect(resolveAutomationBranchLabel({ studioLocationId: 'loc-missing' }, branches)).toBe('Unknown branch');
  });
});

describe('staff vs customer test audience', () => {
  it('detects internal staff triggers and recipient configs', () => {
    expect(isInternalStaffTrigger('invoice_paid_staff')).toBe(true);
    expect(isInternalStaffTrigger('rental_created_staff')).toBe(true);
    expect(isInternalStaffTrigger('rental_created')).toBe(false);
    expect(isStaffAutomationAudience({ triggerType: 'invoice_paid_staff' })).toBe(true);
    expect(isStaffAutomationAudience({
      triggerType: 'payment_received',
      actionRows: [{ type: 'send_email_platform', recipientType: 'role' }],
    })).toBe(true);
    expect(isStaffAutomationAudience({
      triggerType: 'payment_received',
      actionRows: [{ type: 'send_email_platform' }],
    })).toBe(false);
  });

  it('builds staff test recipient context with forceTestRecipient', () => {
    const ctx = buildTestRecipientContext(
      { customerName: 'Customer A', customerId: 'c-1' },
      {
        userId: 'u-1',
        name: 'Ama Mensah',
        email: 'ama@example.com',
        audience: 'internal',
        forceTestRecipient: true,
      }
    );
    expect(ctx.forceTestRecipient).toBe(true);
    expect(ctx.testRecipientUserId).toBe('u-1');
    expect(ctx.recipientUserId).toBe('u-1');
    expect(ctx.assigneeId).toBe('u-1');
    expect(ctx.email).toBe('ama@example.com');
    expect(ctx.recipientName).toBe('Ama Mensah');
    expect(ctx.customerName).toBe('Customer A');
  });

  it('keeps customer picker shape for customer tests', () => {
    const ctx = buildTestRecipientContext({}, {
      customerId: 'c-9',
      name: 'Kofi',
      email: 'kofi@example.com',
      phone: '0244123456',
    });
    expect(ctx.forceTestRecipient).toBeUndefined();
    expect(ctx.customerId).toBe('c-9');
    expect(ctx.customerName).toBe('Kofi');
    expect(ctx.email).toBe('kofi@example.com');
  });
});

