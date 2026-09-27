# ABS Partner Portal

This is the ABS subscription partner portal, separate from Sabito's merchant/marketer partner program.

## Enable

1. Run the existing sales-agent migration if this installation does not already have it: `cd Backend && npm run migrate:sales-agents`.
2. Run `npm run migrate:partner-portal`. The normal `npm run migrate` also includes this migration. This adds two tables; it does not modify existing subscription/commission rules.
3. Restart Backend and deploy/reload Frontend.
4. In Control Panel → Sales agents, create/approve an agent with an email and active referral code.
5. Open **Partner desk**, select that agent and a reseller/distributor role, and optionally assign the reseller to an existing active distributor.
6. Generate an invitation, then share the generated link directly with that partner. No email is sent by this feature.
7. Partner accepts at `/partners#invite=...`, sets a password, then uses `/partners` to sign in.

## Implemented

- Separate partner credentials, eight-hour audience-scoped sessions, and server-side active-agent checks on every authenticated request.
- Random single-use, hashed invitation tokens expiring after 72 hours. Reissuing invalidates sessions and resets access. Partner logout revokes current sessions.
- Referral links integrate with the existing `/signup?code=...` attribution flow.
- Partner-owned leads with contact details, notes, and pipeline stages.
- Own attributed businesses: plan, status, trial end and signup date. No business operational data or impersonation.
- Own commission ledger, paid history and GHS totals. New agreements use a configurable percentage of each successful payment (up to three payments per business). Rates accept 0–100%, with two decimal places; amounts round to the nearest minor currency unit. Rate and payment amount are snapshotted on each new commission. Existing fixed agreements remain until an administrator sets their percentage; earned ledger entries are unchanged.
- Payout destination details and requests. Amounts and commission IDs are derived server-side. Only one pending request per partner is allowed.
- Admin payout settlement requires a reference and atomically marks the requested commissions paid. It records an external payment; it does not send money.
- Support threads with replies and open/closed status, including audit history.
- Distributor roster and referred-business counts for directly assigned resellers. Other partners and their payout destinations remain private.
- Existing sales-agent controls handle active/pending/disabled status, referral codes and commission rate changes.

## Permissions

- `tenants.view`: view the partner desk, accounts and support requests.
- `tenants.update`: issue/reset partner access, assign roles and distributors, reply to support.
- `billing.manage`: read payout requests/destinations and resolve payout requests.
- Partner identities never carry an application user ID; application auth explicitly rejects partner tokens.
- Ownership for partner records is always derived from the authenticated account, never from request input.
- Payout records snapshot destination details when requested. Later profile edits do not redirect an existing request.

## Boundaries of this first version

Distributor commission overrides/revenue-sharing, automatic fund transfers, email delivery, partner-managed reseller invitations, advanced analytics, and a training library are not included. Distributor assignments and new invitations are administered by ABS. Business onboarding means referral signup plus status tracking; partner access to a customer's business requires that business owner's separate invitation. Existing commissions currently support `due` and `paid`; no new refund/reversal policy is introduced here.

Partner data is in `abs_partner_accounts` and `abs_partner_records`. The latter is a workflow ledger for leads, support and payout requests, with owner/kind indexing, payout uniqueness and change history. Existing `sales_agents`, `sales_agent_codes`, `sales_agent_commissions` and tenant attribution remain the source of commercial truth.

## Verification

Backend: `npm test -- --runInBand __tests__/unit/services/absPartnerPortalService.test.js __tests__/unit/services/salesAgentService.test.js`

Frontend: `npm run test:run -- src/__tests__/components/PartnerPortal.test.jsx`

Before launch, run the migration on the intended database and exercise invitation → acceptance → lead → referral signup → paid subscription → payout request → admin recording of payment with test accounts. No partner invitation, payout or email was performed during implementation.

## Setup verification — 2026-09-24

Applied `npm run migrate:partner-portal` to the configured Backend database and verified both tables and all seven indexes. The running local backend on port 5001 returned HTTP 200 for `/health` and HTTP 401 for an unauthenticated `/api/abs-partners/overview` request. The frontend on port 3001 returned HTTP 200 for `/partners`. These checks do not replace a real partner invitation and browser walkthrough.

The expanded local suite passes 39 tests across partner services, existing sales-agent commissions, partner admin controllers, portal sign-in, and admin invitation/support controls.
