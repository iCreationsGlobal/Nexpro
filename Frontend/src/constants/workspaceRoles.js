/**
 * Workspace membership roles and invite-time permission copy.
 * Aligned with Backend/middleware/auth.js, tenant.js (driver scope), and
 * manager-only UI gates (RequireWorkspaceManager, sidebarMenus).
 */

/** Roles that can be assigned when inviting a workspace member. */
export const WORKSPACE_INVITE_ROLES = ['admin', 'manager', 'staff', 'driver'];

/**
 * All workspace membership roles (including non-invitable owner from signup).
 * @type {Record<string, { label: string, summary: string, permissions: string[] }>}
 */
export const WORKSPACE_ROLE_DEFINITIONS = {
  owner: {
    label: 'Owner',
    summary: 'Workspace creator with full control (assigned automatically at signup, not inviteable).',
    permissions: [
      'Same access as Admin across the entire workspace',
      'Billing and subscription ownership',
      'Cannot be removed while they own the workspace',
    ],
  },
  admin: {
    label: 'Admin',
    summary: 'Full workspace control — all shops, studios, settings, and team management.',
    permissions: [
      'Invite users, change roles, and activate or deactivate accounts',
      'Access all shops and studio locations',
      'Approve or reject submitted expenses',
      'Delete quotes, invoices, jobs, and other sensitive records',
      'Reports, marketing, and workspace settings',
    ],
  },
  manager: {
    label: 'Manager',
    summary: 'Oversee day-to-day operations and workspace settings; cannot manage team accounts.',
    permissions: [
      'Sales, inventory, customers, quotes, expenses, and invoices',
      'Reports, marketing, export data, and workspace settings',
      'Create and update shops or studio locations',
      'View team members (cannot invite users or change roles)',
      'Limited to assigned shops or studios when locations are set',
    ],
  },
  staff: {
    label: 'Staff',
    summary: 'Frontline work within assigned shops or studios.',
    permissions: [
      'POS, sales, customers, expenses, quotes, and invoices',
      'Record payments and stock transfers',
      'Cannot access reports, users, or workspace settings',
      'Limited visibility on product cost and margin fields',
      'Limited to assigned shops or studios',
    ],
  },
  driver: {
    label: 'Driver',
    summary: 'Delivery-only access to the queue and status updates.',
    permissions: [
      'View and update delivery queue and statuses',
      'Update profile and view basic organization info',
      'Cannot access sales, inventory, customers, or reports',
      'Limited to assigned shops or studios when set',
    ],
  },
};

/**
 * @param {string} role
 * @returns {{ label: string, summary: string, permissions: string[] } | null}
 */
export const getWorkspaceRoleDefinition = (role) =>
  WORKSPACE_ROLE_DEFINITIONS[role] || null;
