# ABS marketing moves to Lynk

> **Changed 2026-11-22 (later):** ABS keeps **no Messages page and no Marketing entry**. The only entry is Lynk AI, and everything else goes to Lynk.
> - Credits, sender ID and SMS history don't move to "Settings → SMS". They go to Lynk, through assumption A in `.plans/lynk-ai-one-product.md`.
> - Steps 2 and 3 below are replaced by that plan, which covers the four-tab Lynk AI, the bridge contract and the build order.

**Decisions (owner, 2026-11-22)**
- ABS is the management system: stock, sales, invoices, customers and staff. Marketing, designs and posting belong to Lynk.
- No business uses ABS's campaigns or bulk SMS (businesses use ABS only for stock and sales). So they are removed now, without waiting for Lynk. There is no data migration: the tables are dropped.
- Owners reach marketing from inside ABS through Lynk AI: the same session and the same Lynk credit, with no separate sign-in.

**Defaults chosen in this plan (change them if wrong)**
- **Who pays:** the business's Lynk credit pays for everything Lynk sends. ABS Credits keep paying for ABS's own basic messages: receipts, invoices, reminders and rental notices.
- **The menu:** ABS keeps a **Marketing** entry. It opens Lynk AI on the Design tab (`/lynk?tab=design`) until Lynk has a Marketing tab.
- **Consent:** `customers.marketingConsent` stays, because Lynk's audiences will need it. No ABS screen sets it today. `smsConsent` and `whatsappConsent` stay too: job tracking and rental notices use them.

## What goes and what stays

**Goes (the marketing feature)**
- **Campaigns:**
  - the Marketing page and the campaign API (`/api/marketing/*`);
  - audiences, the 5-minute scheduler, the send queue and channel verification;
  - the campaign tables.
- **Bulk SMS on the Messages page:**
  - Compose, which sends to up to 500 pasted numbers, chosen customers or a group;
  - Templates (`sms_marketing_templates`) and Groups (`sms_message_groups`);
  - the Campaigns and Scheduled tabs.
- **`POST /api/marketing/broadcast`:** nothing calls it.

**Stays, and moves out from behind the `marketing` feature key.** The Messages page also holds what ABS's basic SMS needs:
- **Buying ABS Credits.** The backend is `absCreditsRoutes`, and `smsService.resolvePlatformSmsBilling` charges these credits for every platform SMS.
- **The SMS sender ID** (`PUT /api/messages/sender-id`).
- **SMS history**, which covers every delivery event, not only campaigns (`GET /api/messages/history`, `/overview`).

These become **Settings → SMS**. The API paths stay the same, but no longer require the `marketing` feature. The native app doesn't call any of them.

**Stays (they only share the word)**
- Plan copy fields: `SubscriptionPlan.marketing`, `marketingCopy` in `features.js` and `modules.js`, and pricing `?channel=marketing`.
- The "Marketing" expense category and the seed account "Marketing and Advertising".
- The platform admin "Marketing" staff role.
- The platform admin's lead broadcast (`adminLeadController`) and `leads.doNotContact`.
- Links to the marketing website.

ABS has no design, flyer or social posting feature of its own. The Design tab is already Lynk's, and `tenant.metadata.socials` is only sent to Lynk.

## Step 1: ABS removal

**Backend**
- **Remove:** `controllers/marketingController.js`, `routes/marketingRoutes.js`, and these services: `marketingAudienceService`, `marketingCampaignSchedulerService`, `marketingSendQueueService` and `marketingChannelVerification`. Remove the models `MarketingCampaign` and `MarketingCampaignRecipient` too.
- **`server.js`:** remove the route mount and the scheduler start (the `*/5` cron and the send-queue worker).
- **`models/index.js`:** remove the imports, associations and exports. Remove `WhatsAppMessageEvent.campaignId`, and its pass-through in `whatsappService` (the `category: 'marketing'` consent check goes with it).
- **`utils/deleteTenantData.js`:** remove the campaign cleanup.
- **Messages:**
  - Remove Compose, Templates and Groups from `messagesController` and `messagesRoutes`.
  - Keep `/overview`, `/history` and `/sender-id`, with `requireFeature('marketing')` removed (admin and manager only, as now).
- **`settingsController`:** remove the `marketingChannelVerification` hooks and `Tenant.metadata.marketingChannels`.
- **Email:** remove `emailService.sendBulkTenantEmails`, `emailTemplates` `marketingPlainMessageEmail` and its disclaimer, and their use in `scripts/send-test-email.js`.
- **Feature and plan config:**
  - Remove the `marketing` feature in `config/features.js`, plus its `PLAN_FEATURE_KEYS` entries.
  - Remove its entries in `config/businessTypes.js` (shop, studio, pharmacy, rental).
  - Remove `/marketing` and `/messages` in `sidebarPreferenceHelper`.
- **`config/absCreditPacks.js`:** pack copy says "weekly promos" and "high-volume campaigns". Change it to receipts and reminders.
- **`migrations/migrate.js`:**
  - Remove the steps that create campaigns, recipients and tags. The migration files stay in git history.
  - Add the new drop migration below.
- **New migration `drop-marketing-campaigns.js`.** `drop-ai-automations-and-watch.js` is the template. It logs row counts first, then:
  - drops `marketing_campaign_recipients`, `marketing_campaigns`, `sms_marketing_templates` and `sms_message_groups`;
  - drops `whatsapp_message_events."campaignId"`;
  - removes `featureFlags.marketing` from plans and from tenant `featureOverrides`, and the "Marketing broadcasts" perk stored in the database's plans;
  - removes `Tenant.metadata.marketingChannels`, and `/marketing` and `/messages` from saved sidebar preferences.

**Web (`Frontend/src`)**
- **Remove:** `pages/Marketing.jsx` and `services/marketingService.js`, plus the `/marketing` routes in `App.jsx` (including `CampaignEditRedirect`).
- **Messages becomes Settings → SMS:** credits, sender ID and history. Redirect `/messages` and `/messages/credits` there. The buy-credits link from low-balance messages must keep working.
- **Menu:**
  - In `navigation.js`, `sidebarMenus.js`, `appShellNav.js` and `appShellRoutes.js`, the **Marketing** entry opens `/lynk?tab=design`.
  - It is shown to owners, admins and managers, like Lynk AI.
  - The Messages entry goes.
- **Copy:** `constants/workspaceRoles.js`, `SettingsSimpleModeSection.jsx` and `Leads.jsx`.

**Native app**
- Only copy: `app/settings.tsx` says "invoices, marketing and more". That file has uncommitted billing work in it right now. Change it after that work is committed.

**Marketing website and docs**
- Delete `marketing-site/components/sections/ComingSoon.tsx`, which is dead code.
- Update `docs/E2E_TESTING_BY_TENANT_TYPE.md`, and the campaign lines in `.plans/abs-simplify-lynk-powered.md` (the marketing-campaigns cron) and `.plans/lynk-ai-in-abs.md`.

**Tests**
- **Delete:** `marketingSendQueueService.test.js`, `marketingAudienceService.test.js` and `emailTemplates.marketingPlainMessage.test.js`.
- **Edit backend tests:** `planFeatureMatrix`, `tenantEntitlements`, `adminControllerAccess`, `sidebarPreferenceHelper`, `tenantSettingsAdminService` and `settingsControllerSidebarPreferences`.
- **Edit web and e2e:** `__tests__/config/appShellNav.test.js`, `e2e/tests/infinite-lists-work.spec.js` and `e2e/tests/helpers/mockApi.js`.

**Done when:**
- Backend unit tests, web vitest and the phone/tablet e2e pass.
- Receipts, invoices, reminders and rental notices still go out by SMS and are charged to ABS Credits.
- Credits can be bought, and the sender ID set, from Settings → SMS.
- No campaign or bulk-SMS screen is left on web, the native app or the website.
- Marketing opens Lynk AI's Design tab.

**Deploy:** the drop migration runs with `npm run migrate`, on live (Contabo) and on the demo (by hand, from `Backend/.env`). Read the counts it logs on live: they confirm nobody used campaigns.

## Step 2: Lynk (the Lynk session, in `SafeServer`)

Lynk already has these:
- **Create:** flyers, posts and the brand kit.
- **Grow:** Post for me, scheduled Facebook and Instagram posts, campaigns by SMS, WhatsApp or email, and results.
- **Lynk AI for apps:** the Ask, Insights, Design and Import tabs inside ABS.

But campaigns send only to Lynk's own contacts, and nothing from Grow shows inside an app. What to add:

1. **A Marketing tab in Lynk AI for apps** (the `marketing` ability; `lib/app-ai/view.ts`). It brings Create and Grow for the app's business: make a flyer or post, Post for me, schedule to Facebook and Instagram, send a campaign, and see results.
2. **Campaigns to the app's customers.** Add a new signed ask, `audience`, like `assistant.ask`:
   - **Groups:** all customers, bought in the last N days, not bought in N days, birthdays this month, and owes money.
   - **The app answers** with name, phone, email and consent for each person.
   - **Lynk keeps** only what a send and its results need.
3. **Sending** is paid from the business's Lynk credit, using the business's approved sender ID (Lynk's sender ID flow, `lib/sms-sender-ids`).
4. **Facebook and Instagram connection per business.** It waits on Meta's App Review, as Grow already does.
5. **Results:** which campaign or post brought sales. Lynk asks the app for those customers' sales after the send.

## Step 3: ABS connection (short, once Lynk has the tab)

- **The ability:** ABS adds `marketing` to the abilities it sends (`services/lynkAi.js`).
- **Audiences:** ABS answers `audience` asks from its customers, as that person sees them in their shop, and leaves out anyone without consent for that channel.
- **The menu:** the Marketing entry switches from `/lynk?tab=design` to `/lynk?tab=marketing`, on web and in the native app.
