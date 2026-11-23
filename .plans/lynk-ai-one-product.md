# Lynk AI, one product: what Lynk and ABS build (backend and code)

## Status (2026-11-23): step 1 (the foundation) is built. Nothing is committed or deployed.

**ABS:** worktree `../Nexpro-lynk-one`, branch `lynk-one-product`, from abs-v2.
- **A0. Lynk accounts:** a sweep every minute, the backfill `scripts/lynk-accounts-backfill.js`, and Lynk's ids kept in `tenant.metadata.lynk`.
- **A1. Removed:** marketing, Messages and bulk SMS, plus the migration `drop-marketing-campaigns.js`. It logs the counts, then drops the tables.
- **A2. SMS through Lynk:** `services/lynkMessages.js`, used by `smsService.sendMessage`, with each call tagged by what it's for.
- **A3. Events:** `services/lynkOutbox.js` (the outbox, retries and details), plus `message.received` and `review.received` from the store.
- **A4. New answers:** `audience`, `customer_lookup` and `sales_since` (`services/lynkAudience.js`), plus background asks.
- **A5. Actions:** `/api/webhooks/lynk/action` (`services/lynkActions.js`), done once per action id.
- **A7. Lynk AI:** no side panel, and one "Lynk AI" menu entry.
- **Switches:** `LYNK_APP_BUSINESSES` and `LYNK_MESSAGES` (in `env.example`). Migration: `create-lynk-bridge-tables.js`.
- **Tests:** backend unit 206 of 208 suites pass (1,314 tests); the 2 that fail need a real database. Web vitest 339 of 339, web build OK, mobile jest 262 of 262.

**Lynk:** worktree `../SafeServer-apps`, branch `app-businesses`, from main 2cf6479e.
- **L0. Accounts:** `POST /api/v1/app-users` makes a real Business, plus an owner account that can't sign in.
- **L1. The new calls:** `POST /app-users/{id}/events`, `/messages` (SMS and email, from the business's credit, logged in its Inbox) and `/sender-ids`; background asks; `actOnApp`.
- **Migration:** `20261122120000_app_businesses`, additive only.
- **Checks:** tsc clean; the new tests pass, including on the database. The 16 other failures also fail on main.

**Differences from the formats below, accepted on both sides:**
- Lynk's errors are `{ error, code }`, and ABS reads both shapes.
- No credit is HTTP 402 with `error: "no_credit"`.
- A message's cost is in Lynk credit's currency (USD), not GHS.

**Still to decide (owner):**
1. **Sender names:** they skip Lynk's identity check for ABS businesses, because the owner account can't be verified.
2. **Welcome credit:** making an account gives Lynk's welcome credit, so the backfill gives every ABS business $2.
3. **Prices:** check that the production SMS and email credit rates exist and are right. On dev they're 8¢ per SMS part and 3¢ per email.
4. **Lynk's admin numbers:** app businesses can be filtered out of them.

**To ship, in order:**
1. Review and commit both branches.
2. On Lynk: `prisma migrate deploy`, on the demo then live.
3. On ABS: `npm run migrate`, on the demo then live. Read the `[dropMarketingCampaigns] Rows before dropping` line.
4. Set `LYNK_APP_BUSINESSES=true`. Run `node scripts/lynk-accounts-backfill.js --dry-run`, then without `--dry-run`.
5. Deploy ABS's marketing removal **together with** `LYNK_MESSAGES=true`. Without it, nobody can buy SMS credits or see SMS history anywhere in ABS.

**Not built yet:**
- the screens (Home, Inbox, Create, Projects, Automations; from Figma), with Lynk credit shown in cedis for ABS owners;
- each session's person as a member of the business, and the `sends` list;
- campaigns, the Inbox and automations running on app businesses (L2 to L5);
- live WhatsApp on businesses' own numbers, and Facebook and Instagram, after App Review;
- delivery statuses sent back to ABS, and `create_order`;
- retiring ABS's credits backend;
- ABS's side of the WhatsApp owner chat (`whatsapp-assistant.md`);
- `Backend/API_ENDPOINTS*.md`.

**Owner's decisions (2026-11-22)**
- **One Lynk AI, the same everywhere:**
  - Where: Lynk for Businesses (builders and admin come later), ABS, and later other apps.
  - Tabs, from the owner's prototype: **Home, Inbox, Create, Projects, Automations**, plus **Settings**.
  - Top tabs only; never a side menu or side panel.
  - The UI is designed in Figma, so this plan covers backend and code only.
- **ABS stays stable; every improvement ships in Lynk.** ABS's menu has one entry, **Lynk AI**: no Marketing and no Messages in ABS. Campaigns and bulk SMS leave ABS (`.plans/abs-marketing-to-lynk.md`, Step 1).
- **Meta:**
  - ICreations Global is business-verified, and ABS's WhatsApp number is live (`~/Documents/ABS-WhatsApp-Cloud-API-Handover.pdf`).
  - Lynk gets its own Meta app under ICreations Global. What's left is App Review: Facebook and Instagram, and WhatsApp as a Tech Provider.
  - **Zernio is out** (owner, 2026-11-23). Every channel is our own integration:
    - **first:** WhatsApp (each business's own number through Embedded Signup), Facebook and Instagram, through our verified Meta app and App Review;
    - **later:** TikTok, Google Business, YouTube and others, each through its own platform's approval.
    - Lynk keeps one connection layer, so a platform can be added without changing posting, Inbox or results.

- **Every ABS business automatically gets a Lynk account** when it signs up on ABS. Existing businesses get one in a one-off backfill.
  - It's a record on Lynk's side only. The owner never signs in to Lynk.
  - It's what lets the business register sender IDs, hold Lynk credit, keep its brand and use Lynk AI.
- **A. ABS SMS goes; ABS's customer messages go through Lynk** (decided 2026-11-22).
  - ABS still decides *when* to send: receipts, invoices, quotes, payment reminders, order updates and rental notices.
  - Lynk sends them as that business, using its sender ID and its Lynk credit, and each one shows in Lynk's Inbox.
  - Sender IDs are registered on Lynk, and each name is unique across Lynk.
  - ABS SMS credits retire. Leftover balances are cut off.
  - ABS keeps its own account emails: sign-up codes, password resets and team invites.

- **WhatsApp** (decided 2026-11-22):
  - **ABS's approved number** (+233 50 589 6162) is **only for ABS's owner chat.** Business owners ask it "How much am I making?" or "Who owes me?" (`whatsapp-assistant.md`; ABS runs it, with Lynk AI behind it). It never messages a business's customers.
  - **A business that wants WhatsApp with its own customers** (chats, campaigns, receipts) **registers its own number through Lynk** (Embedded Signup). Until it has one, its customer messages go by SMS or email.
- **Credit:** ABS owners see Lynk credit in **cedis (GH₵)**.
- **Leftover ABS SMS credits are cut off,** not converted.
- **Offers in ABS's till:** left out for now.

## The contract between Lynk and an app

- **The app owns its records:** customers, products, stock, sales and invoices. Lynk asks for them when it needs them and **never keeps a copy of the lists**.
- **Lynk keeps only what its own work needs:**
  - what was made (designs, posts, campaigns, forms);
  - send logs and results;
  - conversations;
  - automation runs;
  - the events the app sent it.
- **Lynk → app:** signed calls (`X-Lynk-Signature`, an HMAC of the raw body with the shared secret). These are the asks there today, plus **actions**, which are new.
- **App → Lynk:** API-key calls, scoped to one of the app's businesses. These are sessions, **events** and **messages**, the last two new.
- **Actions that change the app's records** (a sale, an order from a chat, a payment) always need the person's **Confirm**. The app runs them as that person, by its own rules (stock, rights, receipts), and once only (idempotent by action id).

### Exact formats (version 1; both sides build to these)

**Common rules**
- **App → Lynk:** `Authorization: Bearer <LYNK_API_KEY>` to `{LYNK_URL}/api/v1/…`. The app's business is named by `external_id` (ABS: the tenant id).
- **Lynk → app:** `POST` with these headers:
  - `X-Lynk-Signature`: hex HMAC-SHA256 of the raw body, with the shared secret (`LYNK_IMPORT_SECRET`);
  - `X-Lynk-Event`;
  - `X-Lynk-Delivery`.
- **Values:** money is a number in the business's currency (GHS), times are ISO 8601, and phones are E.164 (`+233…`).
- **Errors:** `{ "error": "<sentence a person can read>" }`, with a 4xx or 5xx status.

**1. Accounts.** `POST /api/v1/app-users`

Request:
```json
{ "external_id": "<tenant id>",
  "business": { "name": "", "kind": "shop", "phone": "", "email": "", "address": "", "website": "", "socials": {}, "logo_url": "", "color": "#166534", "currency": "GHS", "country": "GH" },
  "owner": { "id": "<ABS user id>", "name": "", "email": "", "phone": "" } }
```
Response:
```json
{ "id": "<AppUser id>", "external_id": "", "business_id": "", "created": true }
```
It's idempotent by `external_id`. Calling it again updates the profile.

**2. Asks.** Lynk → app, `assistant.ask`, to `ask_url`.

Today's body is `{ session_id, user: {id}, member: {id, role}, question: {kind, …} }`, and the answer is `{ "answer": {…} }`.
- **Background asks** (nobody present: campaigns at send time, daily automations) send:
  - `"session_id": null, "background": true, "shop_id": "<from the session payload, or null>"`
  - `member.id` = the person who set up the campaign or automation.
- **The app accepts a background ask only when:**
  - that person has opened Lynk AI in that business before, and is still an owner, admin or manager;
  - the kind is a read: `audience`, `sales_since`, `customer_lookup`, `summary`, `money_owed`, `low_stock`, `customers` or `products`.
  - Actions are never accepted in the background.
- **The session payload gains:**
  - `shop: { id, name }`, which Lynk keeps with what's made, for background asks;
  - `action_url`.

New kinds:
- **`audience`:**
  - `{ kind: "audience", group, days?, product_id?, from?: "MM-DD", to?: "MM-DD", channel?: "sms"|"whatsapp"|"email", count_only?, limit? (≤500), cursor? }`
  - `group` is `all`, `bought_within`, `not_bought`, `top_spenders`, `owes_money`, `bought_product` or `birthdays`.
  - Answer: `{ group, count, items: [{ id, name, phone, email, consent: { marketing, sms, whatsapp }, eligible: { sms, whatsapp, email }, last_purchase_at, total_spent, link }], next_cursor }`
  - With `channel`, only people **eligible** on that channel are counted and listed.
  - Eligible uses ABS's existing rule: `marketingConsent === true`, plus a contact for the channel; SMS or WhatsApp also needs that channel's consent to not be `false`.
- **`customer_lookup`:**
  - `{ kind: "customer_lookup", phone?, email? }`
  - Answer: `{ found, customer?: { id, name, phone, email, balance, total_spent, purchases, last_purchase_at, consent, link } }`
- **`sales_since`:**
  - `{ kind: "sales_since", since, customers: [{ id? , phone? }] (≤500), product_ids? }`
  - Answer: `{ since, count, total, customers: [{ id, phone, sales, total, last_at }] }`

**3. Actions.** Lynk → app, `assistant.action`, to `action_url`, **only after the person taps Confirm**.

Body:
```json
{ "event": "assistant.action", "session_id": "", "user": {"id": ""}, "member": {"id": "", "role": ""},
  "action": { "id": "<unique>", "kind": "", "params": {} }, "confirmed_at": "" }
```
Answer:
```json
{ "ok": true, "record": { "type": "", "id": "", "label": "", "link": "" } }
```
- **Failure:** `{ "ok": false, "error": "…" }`, with a 4xx status.
- **Same `action.id` again:** the same answer, with nothing done twice.

Kinds:
- `record_sale`: `{ customer?: { id?|phone?|name? }, items: [{ product_id, variant_id?, quantity, price? }], payment: { method: "cash"|"mobile_money"|"card"|"bank_transfer"|"credit", amount_paid? }, note? }`
- `record_payment`: `{ invoice_id, amount, method, reference?, date? }`
- `record_expense`: `{ amount, category, description?, date?, payment_method? }`
- `create_customer`: `{ name, phone?, email?, consent?: { marketing?, sms?, whatsapp? } }`
- `set_consent`: `{ customer: { id?|phone? }, channel: "marketing"|"sms"|"whatsapp", value: true|false }`
- `create_order` comes later, with the Inbox.

**4. Events.** App → Lynk, `POST /api/v1/app-users/{external_id}/events`

Body (up to 100 events):
```json
{ "events": [{ "id": "<unique>", "type": "sale.completed", "occurred_at": "", "shop_id": null, "data": {} }] }
```
Answer: `{ "accepted": 1, "duplicates": 0 }`. It's idempotent by `id`.
- **Types:**
  - ABS's 21: sale.completed, order.created, order.status_changed, invoice.sent, invoice.paid, payment.received, quote.sent, quote.accepted, job.created, job.assigned, job.completed, lead.created, lead.assigned, customer.created, stock.low, stock.out, task.assigned, rental.created, rental.checked_out, rental.returned, rental.cancelled;
  - plus `message.received`, `review.received` and `invoice.overdue`.
- **`data`:** the record's ids, plus `customer: { id, name, phone, email }` when there is one, and `amount` or `items` where they apply. It never holds whole lists.

**5. Messages.** App → Lynk, `POST /api/v1/app-users/{external_id}/messages`

Body:
```json
{ "id": "<unique>", "kind": "receipt|invoice|quote|payment_reminder|order_update|rental_notice|job_update|other",
  "to": { "name": "", "phone": "", "email": "" }, "channels": ["whatsapp", "sms", "email"],
  "text": "", "subject": "", "html": "", "document": { "url": "", "filename": "" } }
```
Answer: `{ "id": "", "status": "sent|queued|skipped|failed", "channel": "sms", "cost": { "amount": 0.25, "currency": "GHS" }, "error": "" }`

- **Which channel:** Lynk uses the first channel it can.
  - WhatsApp, only from the business's own connected number.
  - SMS, with its approved sender ID, otherwise Lynk's default.
  - Email.
- **Billing and records:** charged to the business's credit (`no_credit` when it's empty) and logged in its Inbox.
- **Idempotent** by `id`.

---

## Part 1: Lynk (in `SafeServer`, by the Lynk session)

### L0. An app's business becomes a real Lynk Business (the foundation; everything else needs it)

Today an app's business is an `AppUser` with **no `Business`** (`prisma/schema.prisma`; `lib/app-ai/session.ts` keeps the business only as each session's JSON). Every Create, Inbox, Automations and Settings feature is keyed by `businessId`, or by `userId`, which for an app is the developer's one account. All ABS shops would share one brand kit, contact lists, sender IDs, messaging plan and suppression list.

- **The app creates the account when its business signs up:**
  - A new `POST /api/v1/app-users`, with the API key, ensures three things exist and are linked: the `AppUser`, a Lynk `User` marked as app-managed (no password, never signs in), and the `Business` that User owns, linked to the app (`ImportApp`).
  - It's idempotent by the app's `externalId`, and returns the ids.
  - `AppUser.businessId` → that Business. Opening a session for a business without one creates it the same way, as a safety net.
- **Sender IDs:** registered by the business from Lynk AI's Settings (`lib/sms-sender-ids.ts`, approved through mNotify). The name is unique across Lynk, as `SmsSenderId.name` already is.
- **The profile:** the session's `business` JSON (name, kind, logo, colour, contact, socials) is saved on the Business and refreshed each session.
- **People:** each session's `member {id, role}` maps to a member of that Business. That's what makes Inbox "seen", approvals, assignments and memory per person work.
- **Re-key to `businessId`** what's per user today:
  - `BrandKit` (`userId @unique`), `ContactList` (unique on userId and name), `MessagingPlan`, `SmsSenderId` (businessId is optional today), `MarketingSuppression` and `Broadcast`;
  - the senders (`broadcastSenders(userId)`, `senderFor(userId)`).
- **One balance per business:** `AppUser.creditCents` pays for AI and designs (as today), and now also messages and campaigns. The charging functions (`lib/app-ai/credits.ts`, `reserveMessages`, `sendSmsAndDebit`) take an app business.
- **Tabs** (`lib/app-ai/view.ts` `tabsOf`) become `home, inbox, create, projects, automations`, plus `settings`. Which ones show depends on:
  - the app's abilities;
  - the **Marketing switch** (`lib/business/marketing-switch.ts`). It applies to app businesses too, and while it's off, Inbox, Automations, posts and campaigns stay hidden;
  - `LYNK_DESIGN_FOR_BUSINESSES` and `LYNK_META_ENABLED`, as today.
- **Lynk's own businesses** get the same screen, using the same views, fed by Lynk's own tables instead of asks. The Marketing side of Lynk's menu retires.

### L1. The bridge, version 2 (the contract all apps use)

1. **New asks** (`assistant.ask`, the same signing; answered as the person, in their shop):
   - **`audience`:**
     - **Groups:** `all`, `bought_within {days}`, `not_bought {days}`, `top_spenders {n}`, `owes_money`, `bought_product {productId}`, `birthdays {from,to}`.
     - **Returns** name, phone, email and consent per channel (sms, whatsapp, email, marketing).
     - **`count_only`** gives the cost estimate before sending.
   - **`customer_lookup`:** by phone or email, giving the customer card for an Inbox conversation (last purchase, balance).
   - **`sales_since`:** sales by these customers (phones or ids) since a time. This is how a campaign or post gets its results.
   - The existing `products` and `find` answers, plus a check that they return **price, stock per shop and the image link**.
2. **Actions:**
   - **What happens:** a new event `assistant.action` (Lynk → app). Lynk prepares it, the person taps Confirm, and the app runs it and returns the record and its link.
   - **Kinds:** `record_sale`, `create_order`, `record_payment`, `record_expense`, `create_customer` and `set_consent` (an opt-in, or an opt-out such as "STOP" on WhatsApp).
3. **Events in:** `POST /api/v1/app-users/{externalId}/events`, using the API key.
   - It takes the app's event types, stored as `BusinessEvent` for that business. `lib/engine/events.ts` `EVENT_TYPES` accepts them when they come from an app.
   - They feed automations, rules, results and Home.
4. **Messages in:** `POST /api/v1/app-users/{externalId}/messages`.
   - **What it does:** sends SMS, WhatsApp (a template, or free text inside the 24-hour window) or email to a customer **as that business**: receipt, invoice with a PDF link, reminder, order update.
   - **Billing and records:** it's billed to the business's credit and logged in its Inbox. Delivery statuses are kept, and sent back to the app if it asks for them.
   - **Why it's new:** `/api/v1/sms`, `/email` and `/whatsapp` exist but bill the developer's account, not the business.
5. **The session** gains `sends`: the messages the app sends itself (receipt, invoice, overdue_reminder, order_updates, rental_notices). Lynk then hides or skips the automations that would send them twice.

### L2. Home
- **What needs you:** `lib/app-ai/insights.ts` `needsAttention` (the app's 4 cards), plus Lynk's own items: posts waiting for approval, unanswered Inbox conversations, campaign results, automations waiting for approval, and low credit.
- **Results:** from Lynk's send logs and tracked links (`CampaignLink`), with sales from the `sales_since` ask and `sale.completed` events.
  - Posts have no attribution today. A sale counts when a customer who tapped the post's tracked link, or messaged after it, buys within N days.
- **Website visits:** only where Lynk hosts the site. ABS's storefront doesn't count visits, so it either adds a counter that sends an event, or that card isn't shown for ABS.

### L3. Inbox
- **For app businesses:** `lib/inbox.ts` `inboxItems` works once L0 exists. Add `WebsiteChat`, which it leaves out today.
- **WhatsApp, made live,** but **only on a business's own number**, registered through Lynk (Embedded Signup, keeping their WhatsApp Business phone app). This waits for App Review.
  - Today `sendWhatsApp` in `lib/services/messaging.ts` throws "not configured".
  - Use the Cloud API: templates, free text, media and statuses, an inbound webhook that checks the signature and ignores duplicates, and the 24-hour window.
  - ABS's `Backend/services/whatsappService.js` already has working Cloud API sending and signature code that can be ported.
  - ABS's own number is never used for a business's customers.
- **Facebook and Instagram messages and comments:** `lib/connectors/meta.ts` handles lead ads only. It needs the messaging and comment permissions, their webhook events in `handleMetaWebhook`, and App Review.
- **SMS replies:** none anywhere today. Leave them for later, unless mNotify can forward replies.
- **From apps:** an app's own inbound messages (ABS's storefront "contact the seller", store reviews, `CustomerFeedback`) arrive as `message.received` and `review.received` events.
- **AI replies:** the customer assistant (`lib/business/customer-assistant.ts`) answers on WhatsApp, Instagram and Facebook from the business's knowledge, plus asks for products, prices, stock and order status.
  - It stays business-specific only, per Meta's rules. It has Take over and assignment.
  - An order in a chat becomes a `create_order` action, confirmed by staff.

### L4. Create and Projects
- **Designs:** an app's designs (`lib/app-ai/design.ts`, today `userId` = the developer and `businessId` null) belong to the business. They then show in Projects and get brand and taste notes.
- **Posts and Post for me** (`lib/grow/posts.ts`, `autopilot.ts`):
  - app businesses get `ConnectedAccount`s (Facebook Page, Instagram);
  - posts waiting for approval show on Home;
  - publishing waits on `LYNK_META_ENABLED` and App Review;
  - WhatsApp isn't a place to post.
- **Campaigns** (`lib/broadcasts.ts`):
  - **Who gets it:** recipients come from the `audience` ask at send time, filtered by consent for that channel and by `MarketingSuppression` (per business).
  - **Channels:** SMS (mNotify), email (Resend) and **WhatsApp**: a marketing template, to opted-in people only. Instagram and Facebook can't do broadcasts.
  - **Cost and links:** the estimate comes from `count_only`, the charge goes to the business's credit, and links are tracked.
- **Ads:** stay a Specialist "Run my ads" job (`SpecialistJob RUN_ADS`) until Meta ads (Grow stage C).
- **Offers, links page, forms:** not for app businesses in this round.
  - Offers need the app's till to apply them.
  - A links page needs the app's links.
  - A form's enquiries would need `create_customer` in the app.
  - They come back when an app asks for them.
- **Projects:** one list across Design, ScheduledPost, Broadcast (and later Offer and LeadForm). Each has its type, status and results, and filters by type.

### L5. Automations
- **For app businesses:** run the catalogue (`lib/automations/catalogue.ts`, `run.ts`):
  - **from app events:** `sale.completed` → review request, `invoice.paid` → thanks;
  - **from daily asks:** birthdays, win-back (`audience` `not_bought`);
  - **Post for me.**
- **Sending** uses the business's sender ID and credit.
- **Rules** (`lib/rules/catalogue.ts`): triggers include the app's event types. Actions are messages, telling a staff member, and tasks.
- **No double messages:** the catalogue entries the app sends itself (`sends` in L1.5) are hidden for that business.

### L6. Settings
- **Channels:** `ConnectedAccount` and the WhatsApp connection.
- **SMS sender ID:** one per business (`SmsSenderId.businessId`, approved through mNotify), used for campaigns, automations and the app's own messages (assumption A).
- **Brand:** `BrandKit` per business, filled from the app's business profile.
- **Credit:** `AppUser.creditCents`, topped up with the existing buy flow.
- **Memory:** `AssistantMemory` per business. Taste notes need L0.

### L7. Meta
- **The app:** create the Lynk Meta app under ICreations Global, and set `META_APP_ID`, `META_APP_SECRET` and `LYNK_META_ENABLED`.
- **App Review:**
  - Facebook and Instagram: `META_SCOPES` in `lib/connectors/meta.ts`, plus messaging and comments;
  - WhatsApp: Advanced access to `whatsapp_business_messaging` and `whatsapp_business_management`, for Embedded Signup.
- **ABS's own number** stays with ABS, for the owner chat. Rotate the integrator's token and app secret (handover §5.3), and add the currency and card on the WhatsApp account (§8.3).

---

## Part 2: ABS (in `Nexpro`; small, so ABS stays stable)

### A0. A Lynk account for every ABS business
- **At sign-up:** when a business signs up (`tenantProvisioningService`), ABS calls Lynk's `POST /api/v1/app-users` (L0). It saves the returned ids on the tenant (`metadata.lynk`: appUserId, businessId).
  - It never blocks the sign-up: if Lynk is down, it's retried later.
- **Existing businesses:** a one-off backfill script (on the demo first, then live).
- **Sender IDs:** ABS businesses' existing sender ID names (`PUT /messages/sender-id`) are sent to Lynk as requests. Lynk's provider (mNotify) has to approve them again, because they were approved on ABS's providers.
- **Opening Lynk AI** uses the saved account.

### A1. Remove marketing and Messages
- Do `.plans/abs-marketing-to-lynk.md` Step 1, **changed:** the Messages page goes entirely, not into Settings → SMS. Credits, sender ID and history move to Lynk (assumption A).
- The menu (web and phone app) keeps only **Lynk AI**.
- `Customer.marketingConsent` stays, because Lynk's audiences need it.

### A2. Send customer messages through Lynk (assumption A)
- **The rewire:**
  - `smsService`, `whatsappService` and `emailService` (the customer-message paths only) call Lynk's messages API (L1.4) as that business.
  - `messageDeliveryRulesService` and the senders (`autoSendReceiptIfEnabled`, `paymentReminderService`, `orderCustomerNotificationService`, `rentalNotificationService`, `jobCustomerTrackingService`) stay as they are and decide *when*.
- **PDFs:** Lynk needs a link it can fetch. Invoices, quotes and jobs have public view links. Check receipts.
- **ABS credits:** retire `absCreditsService` and `absCreditPacks`. Leftover balances are cut off.
- **Businesses with their own SMS or WhatsApp settings** in ABS (their own provider keys, the `whatsapp` Setting): these retire too. A business's WhatsApp to its customers comes only from its own number, registered through Lynk.
- **ABS's account emails** stay in ABS.

### A3. Events to Lynk
- **The switch-on:** `Backend/services/businessEvents.js` `emitBusinessEvent` already sits at every call site (sales, invoices, customers, products, quotes, jobs, leads, tasks, rentals) and drops each event.
- **Make it send:** signed, queued, retried, never blocking the sale. Each event carries only what Lynk needs (ids, customer phone, amount, items, shop).
- **New events:**
  - `message.received` (the storefront "contact the seller");
  - `review.received` (`StorefrontReview`, `CustomerFeedback`);
  - a daily `invoice.overdue`.

### A4. New answers on the bridge (`Backend/services/lynkAsk.js`)
- **`audience`:** a new service, scoped by shop like `customerReadWhere`, with consent per channel and `count_only`. It replaces `marketingAudienceService` (being removed) and `quietCustomers`.
  - Add `bought_product` (from `SaleItem.productId`), `birthdays` (`dateOfBirth`, stored as 2000-MM-DD) and `top_spenders` (`reportController.getTopCustomers`).
  - Add composite indexes `sales(tenantId, customerId, createdAt)` and `invoices(tenantId, customerId)`. Invoices have none today.
- **`customer_lookup`** by phone or email, and **`sales_since`** by customers.
- **`products` and `find`:** return price, stock per shop (`ProductShopStock`) and the image link.

### A5. Actions (`POST /api/webhooks/lynk/action`, signed like `/lynk/ask`)
- **How it runs:** as the person (the same `contextFor` and `runHandler` as asks), once only by action id.
- **What each does:**
  - `record_sale` → `createSaleCore` (with `clientId`);
  - `create_order` → the online-order path (`createPendingStorefrontSaleFromCheckout` logic: pending, received);
  - `record_payment`, `record_expense`, `create_customer`;
  - `set_consent`.
- **The result:** each returns the record id and its web and phone-app link. Undo for a short while can come later.

### A6. Consent
- **Opt-in:** Meta requires it. ABS's customer forms need the SMS, WhatsApp and marketing consent fields set (the UI is from Figma; the fields exist).
- **Opt-out:** comes from Lynk through `set_consent`.

### A7. Opening Lynk AI
- **The session** (`Backend/services/lynkAi.js`):
  - abilities for the new tabs, plus `audience`, `customer_lookup`, `sales_since` and `actions`;
  - `sends` (L1.5).
- **Remove the side panel:** `screen: 'panel'`, `LynkAiPanel.jsx`, and the header toggle (`Header.jsx`).
- **Buttons that open Lynk AI** go to `/lynk?tab=…&view=…`.
- **"Ask about this"** on a record opens `/lynk?tab=home&q=…` with the record in `page`. Today `lynkPage.js` names only invoices and expenses on web; the phone app names more.
- **The phone app** (`mobile/app/lynk.tsx`) does the same.

### A8. WhatsApp
- **ABS's number is for the owner chat only.** ABS builds it as in `whatsapp-assistant.md`: ABS's webhook, owners linking their phone, Lynk AI behind it, and actions with Confirm through A5.
- **It never messages a business's customers.** The six templates approved for it (receipt, invoice, reminder…) aren't used for customers.
- **Later:** the per-business `whatsapp` Setting (credentials pasted into ABS) goes. Businesses connect their own number in Lynk.

---

## Order

1. **Foundation, nothing visible:**
   - **Lynk:** L0 (accounts made automatically) and L1 (events, messages, the new asks and actions).
   - **ABS:** A0 (a Lynk account at sign-up, plus the backfill), A3, A4 and A5.
   - **Proven on the demo** (demo-api.africanbusinesssuite.com) with a test business.
2. **Create and Projects for ABS:**
   - **Lynk:** designs on the business; campaigns by SMS and email from `audience`; results from `sales_since`.
   - **ABS:** A1, A2 and A7.
   - **Live:** WhatsApp campaigns once the WhatsApp account has its currency and card.
3. **Inbox:** live WhatsApp on the shared number, inbound messages, the customer assistant with asks, orders from chats (`create_order`), and storefront messages and reviews (A3).
4. **Automations:** the catalogue on app events and daily asks, plus Post for me (posting waits on step 5).
5. **After Meta's App Review:** Facebook and Instagram posts, messages and comments, and businesses' own WhatsApp numbers through Embedded Signup.

**Done when, each step:**
- An ABS owner on the demo can do that step's job from Lynk AI.
- ABS's receipts, invoices and reminders still arrive.
- Nothing is sent twice.
- Each charge lands on the right business's credit.

## Open questions for the owner
None right now. The 2026-11-22 answers are in the decisions at the top.
