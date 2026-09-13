/**
 * Central catalog of system message events. ABS owns template content;
 * tenants only toggle which channels may deliver each event.
 */

const CHANNELS = ['email', 'sms', 'whatsapp'];

const MESSAGE_EVENTS_CATALOG = {
  invoice_sent: {
    key: 'invoice_sent',
    label: 'Invoice sent',
    category: 'sales',
    description: 'When an invoice is sent to a customer.',
    allowedChannels: ['email', 'sms', 'whatsapp'],
    requiredChannels: [],
    defaultChannels: { email: true, sms: true, whatsapp: true },
  },
  payment_reminder: {
    key: 'payment_reminder',
    label: 'Payment reminder',
    category: 'sales',
    description: 'Overdue invoice payment reminders.',
    allowedChannels: ['email', 'sms', 'whatsapp'],
    requiredChannels: [],
    defaultChannels: { email: true, sms: true, whatsapp: true },
  },
  sales_receipt: {
    key: 'sales_receipt',
    label: 'Sales receipt',
    category: 'sales',
    description: 'Receipt after a completed sale (POS or manual send).',
    allowedChannels: ['email', 'sms', 'whatsapp'],
    requiredChannels: [],
    defaultChannels: { email: true, sms: true, whatsapp: true },
  },
  order_created: {
    key: 'order_created',
    label: 'Order created',
    category: 'sales',
    description: 'Customer alert when an order is created.',
    allowedChannels: ['email', 'sms', 'whatsapp'],
    requiredChannels: [],
    defaultChannels: { email: true, sms: true, whatsapp: true },
  },
  order_status: {
    key: 'order_status',
    label: 'Order status update',
    category: 'operations',
    description: 'Customer-facing order or kitchen status updates.',
    allowedChannels: ['email', 'sms', 'whatsapp'],
    requiredChannels: [],
    defaultChannels: { email: true, sms: true, whatsapp: true },
  },
  job_completed: {
    key: 'job_completed',
    label: 'Job completed',
    category: 'operations',
    description: 'When a studio job is marked completed.',
    allowedChannels: ['email', 'sms', 'whatsapp'],
    requiredChannels: [],
    defaultChannels: { email: false, sms: false, whatsapp: true },
  },
  rental_created: {
    key: 'rental_created',
    label: 'Rental confirmation',
    category: 'operations',
    description: 'When a rental is booked or a pre-booking is confirmed.',
    allowedChannels: ['email', 'sms', 'whatsapp'],
    requiredChannels: [],
    defaultChannels: { email: true, sms: true, whatsapp: true },
  },
  rental_checked_out: {
    key: 'rental_checked_out',
    label: 'Rental handover',
    category: 'operations',
    description: 'When rental items are handed over to the customer.',
    allowedChannels: ['email', 'sms', 'whatsapp'],
    requiredChannels: [],
    defaultChannels: { email: true, sms: true, whatsapp: true },
  },
  rental_returned: {
    key: 'rental_returned',
    label: 'Rental returned',
    category: 'operations',
    description: 'When a rental return is recorded.',
    allowedChannels: ['email', 'sms', 'whatsapp'],
    requiredChannels: [],
    defaultChannels: { email: true, sms: true, whatsapp: true },
  },
  rental_due: {
    key: 'rental_due',
    label: 'Rental due reminder',
    category: 'operations',
    description: 'Reminders before or after a rental is due back.',
    allowedChannels: ['email', 'sms', 'whatsapp'],
    requiredChannels: [],
    defaultChannels: { email: true, sms: true, whatsapp: true },
  },
  team_invite: {
    key: 'team_invite',
    label: 'Team invite',
    category: 'account',
    description: 'Workspace invitation email to join the team.',
    allowedChannels: ['email'],
    requiredChannels: ['email'],
    defaultChannels: { email: true },
  },
  otp: {
    key: 'otp',
    label: 'Verification code (OTP)',
    category: 'security',
    description: 'One-time codes for verification flows.',
    allowedChannels: ['email', 'sms'],
    requiredChannels: ['email'],
    defaultChannels: { email: true, sms: true },
  },
  password_reset: {
    key: 'password_reset',
    label: 'Password reset',
    category: 'security',
    description: 'Password reset links and instructions.',
    allowedChannels: ['email'],
    requiredChannels: ['email'],
    defaultChannels: { email: true },
  },
};

const MESSAGE_EVENT_KEYS = Object.keys(MESSAGE_EVENTS_CATALOG);

const getMessageEventDefinition = (eventKey) => MESSAGE_EVENTS_CATALOG[eventKey] || null;

const listMessageEventsCatalog = () =>
  MESSAGE_EVENT_KEYS.map((key) => {
    const def = MESSAGE_EVENTS_CATALOG[key];
    return {
      key: def.key,
      label: def.label,
      category: def.category,
      description: def.description,
      allowedChannels: [...def.allowedChannels],
      requiredChannels: [...(def.requiredChannels || [])],
    };
  });

module.exports = {
  CHANNELS,
  MESSAGE_EVENTS_CATALOG,
  MESSAGE_EVENT_KEYS,
  getMessageEventDefinition,
  listMessageEventsCatalog,
};
