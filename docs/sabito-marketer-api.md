# Sabito Marketer API Contract (ABS)

Base: `{ABS_API}/api`  
Auth: `Authorization: Bearer <jwt>` where JWT payload is `{ id, type: "sabito_marketer" }`.

## Public marketplace

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/public/sabito-partners` | no | `?category&search&limit` |
| GET | `/public/sabito-partners/:slug` | no | Partner detail + rates |

## Marketer auth

| Method | Path | Auth |
|--------|------|------|
| POST | `/public/sabito-marketer/auth/register` | no |
| POST | `/public/sabito-marketer/auth/login` | no |
| GET | `/public/sabito-marketer/auth/me` | marketer |
| PATCH | `/public/sabito-marketer/auth/profile` | marketer |
| POST | `/public/sabito-marketer/auth/forgot-password` | no | body `{ email }`; generic acknowledgement |
| POST | `/public/sabito-marketer/auth/reset-password` | no | body `{ email, code, password }` |
| POST | `/public/sabito-marketer/auth/change-password` | marketer | body `{ currentPassword, password }` |
| DELETE | `/public/sabito-marketer/auth/account` | marketer | body `{ password }`; closes access while retaining settlement records |

## Partnerships

| Method | Path | Auth |
|--------|------|------|
| POST | `/public/sabito-marketer/applications` | marketer | body `{ tenantId, pitch? }` |
| GET | `/public/sabito-marketer/applications` | marketer |
| GET | `/public/sabito-marketer/partnerships` | marketer |

## Referrals

| Method | Path | Auth |
|--------|------|------|
| POST | `/public/sabito-marketer/referrals` | marketer | body `{ partnershipId, clientName, clientEmail, clientPhone, location?, note? }` |
| GET | `/public/sabito-marketer/referrals` | marketer |
| GET | `/public/sabito-marketer/referrals/:id` | marketer |

Statuses: `pending` | `matched` | `conflict` | `closed`  
Match: normalized email OR phone to tenant `Customer`; first-touch attribution.

## Earnings & cashouts

| Method | Path | Auth |
|--------|------|------|
| GET | `/public/sabito-marketer/earnings` | marketer | `?status=due\|cashout_pending\|paid` |
| GET | `/public/sabito-marketer/dashboard` | marketer | balances + counts |
| POST | `/public/sabito-marketer/cashouts` | marketer | body `{ commissionIds: string[], notes? }` |
| GET | `/public/sabito-marketer/cashouts` | marketer |
| GET | `/public/sabito-marketer/cashouts/:id` | marketer |

Cashout eligibility: `status === "due"`, `remittanceStatus === "collected"`, and no `cashoutRequestId`. A request contains commissions from one business only. Display `marketerShareAmount ?? amount`, preserving an explicit zero share. The server computes the final amount.

Commission statuses: `due` → `cashout_pending` → `paid` (reject cashout → back to `due`).

## Tenant (ABS Settings)

| Method | Path | Auth |
|--------|------|------|
| GET | `/partner-program/referrals` | admin/manager |
| GET | `/partner-program/cashouts` | admin/manager |
| POST | `/partner-program/cashouts/:id/approve` | admin/manager |
| POST | `/partner-program/cashouts/:id/reject` | admin/manager | body `{ notes? }` |
| POST | `/partner-program/cashouts/:id/mark-paid` | admin/manager | body `{ payoutReference?, notes? }` |

All successful responses: `{ success: true, data }`.  
Errors: `{ success: false, message, errorCode? }`.
