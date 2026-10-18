# Simplify ABS: AI, advanced automations and Watch move to Lynk

**Decisions (2026-10-18)**
- From now on the work is on Lynk. ABS gets one last cleanup, then changes very little: bug fixes, plus one short connection step when Lynk is ready.
- Lynk will power ABS's AI, advanced automations and Watch. ABS keeps only what it can't work without.
- Automations split in two:
  - **Basic** (fixed, stays in ABS): messages ABS already sends by itself, without the automation engine, plus rental confirmations.
  - **Advanced** (moves to Lynk): everything else, including the rule builder.
- Insight cards on the dashboard and in reports are removed until Lynk provides insights. They use plain rules, not AI, but they go too.
- Watch is rebuilt in Lynk, and ABS uses it from there.
- No data migration: no one relies on V2's messages, so the automation and Watch tables are dropped, not archived.
- ABS keeps one event function now, as the future hand-off to Lynk. No API work until Lynk is ready.

## Status (2026-10-18)
- Step 1 is built on `abs-v2` and not committed yet. The code before it is tagged `abs-v2-before-lynk-split`.
- Tests: backend unit tests 1187/1191 (the 4 failures were already failing before), web vitest 265/265, web build OK, phone/tablet e2e 77 passed, native jest 170/170, native tsc clean.
- Deploy: `migrations/drop-ai-automations-and-watch.js` runs on the next deploy. It drops the automation and Watch tables, deletes the stored AI keys, and renames the permission `automations.view` to `messaging.view`.
- Ops after deploy:
  - Remove `ANTHROPIC_API_KEY`, `AI_CREDENTIALS_ENCRYPTION_KEY`, `AI_BILLING_CIRCUIT_TTL_MS`, `OPENAI_API_KEY`, `AUTOMATION_*` and `WATCH_*` from the hosts.
  - Empty the Watch S3 bucket.
  - Regenerate `docs/ABS-Terms-and-Conditions.pdf`.
  - Ship a native app release.
- Built-in defaults now decide these:
  - Job tracking link: off until switched on.
  - Job completed: WhatsApp.
  - Overdue reminder email: only if switched on.
  - Rental due/overdue reminders: email only.
  - Rental confirmation, handover and return: SMS and email.

## Basic messages (stay in ABS)

These are fixed messages with on/off and SMS/WhatsApp/email switches in Settings → Delivery rules (`/settings/delivery-rules`), built on `Backend/config/messageEventsCatalog.js` and `services/messageDeliveryRulesService.js`.

**Sales and money**
- Sale receipt
- Invoice sent
- Quote sent
- Payment confirmation
- Overdue invoice reminder (`paymentReminderService`, daily)

**Orders and jobs**
- Online order received, and order status (`orderCustomerNotificationService`)
- Job tracking link (`jobCustomerTrackingService`), and job completed (`jobController`)

**Rentals**
- Due and overdue reminders (`rentalNotificationService`)
- Confirmation, handover and return. **These need a new built-in sender**, because today only automations send them.

**Staff**
- Job assigned (`jobAssigneeEmailService`)
- Task assigned (`userWorkspaceController`)
- Low and out-of-stock alerts (`productController`)
- Job due reminder (`jobDueReminderService`)
- Quote accepted (`quoteController`)

**Account**
- Team invite
- Verification codes
- Password reset

**Receipts:** today a default rule sends them to everyone. The built-in receipt switch (`customer-notification-preferences.autoSendReceiptToCustomer` / POS `auto_send`) must start on for new workspaces, so behaviour doesn't change.

## Advanced (moves to Lynk)

**Customer messages**
- Birthday, win-back (inactive customers), review requests, welcome for new customers
- Quote follow-up, lead no-contact follow-up, "invoice due soon" reminders
- Prescription refill reminders
- Rental cancelled

**Alerts and summaries**
- Daily sales summary
- High-value invoice, low profit margin, product expiry
- Staff notifications not in the basic list: payment received, invoice paid, invoice overdue, sale completed, order created and status, job created and completed, lead new and assigned, rental created, returned and overdue

**Tools**
- Automatic follow-up tasks (`taskAutomationService`, `autoTaskSchedulerService`)
- The rule builder, custom rules, the AI Builder

Lynk's automation catalogue (`SafeServer/lib/automations/catalogue.ts`) already has birthday, win-back, review request, morning brief, invoice reminders and order updates, but they only run on Lynk's tables.

## Step 1: ABS cleanup (ABS only; the last big change)

Before starting, tag the last commit before removal (e.g. `abs-v2-before-lynk-split`). Lynk can then take the Watch agent and the assistant/report prompts from it.

**Remove AI**
- **Ask Ayebia, backend:** remove `controllers/assistantController.js`, `routes/assistantRoutes.js`, `services/assistant/*`, `utils/assistantIdentity.js` and `utils/assistantSupportGuide.js`.
  - Keep `POST /api/assistant/chat` answering older native app versions with a friendly "no longer available" message instead of an error.
- **Ask Ayebia, web:** remove `pages/AskAI.jsx`, `components/AssistantChatPanel.jsx`, `IbisMoreMenu`, `constants/ibis.js`, `constants/assistantPrompts.js`, the ibis/assistant hooks, services and utils, and `/ask-ai` in `App.jsx`.
  - Also remove the floating button in `MainLayout.jsx`, the header buttons in `Header.jsx` and `AppHeader.jsx`, and the `/ask-ai` entries in `navigation.js` and `appShellRoutes.js`.
- **Ask Ayebia, native app:** remove `mobile/app/(tabs)/chat.tsx` and its tab registration, the button in `components/Header.tsx`, `IbisMoreSheet`, and the ibis/assistant files. Also remove the assistant error codes in `services/api.ts`.
- **Analysis engine:** remove `services/analysis/*`, `analysisController` and `analysisRoutes`. It is only used by the chat and the insight cards.
- **Insight cards:**
  - Remove the dashboard "AI Insight" card (`pages/Dashboard.jsx`).
  - Remove the reports `AIQuickInsightsCard.jsx` (and `overviewUtils.buildOverviewInsights` if nothing else uses it).
  - Remove the native app's dashboard insight (`mobile/app/(tabs)/index.tsx`, `utils/dashboardInsights.ts`).
- **Smart Report:** keeps its numbers, but loses the AI write-up and the type-your-own-question mode.
  - Remove `POST /api/reports/ai-analysis` and its handler.
  - Remove `utils/reportAnalysisFallback.js` and `utils/parseAiJsonResponse.js`.
  - Remove the AI fields in `Reports.jsx` and `reports/smart-report/*`.
- **Settings → AI:** remove `tenantAiSettingsService.js`, the `/settings/ai` routes and handlers, `SettingsAiPage`, `SettingsAiSection`, `useSettingsAI`, and `scripts/setup-ai-credentials.js`. Delete the stored `settings['ai']` rows.
- **Store banner generator:** remove `POST /api/store/banner/generate` and `storeService.generateBanner`. Nothing in the app calls them.
- **`services/openaiService.js`:** remove the whole file.
- **`utils/aiProviderErrors.js` (backend, web and native app):** this is shared plumbing. The global error handler, web `utils/toast.js` and mobile `utils/parseApiListResponse.ts` import it. Strip the AI parts and keep or rename what the general error handling needs.
- **Packages:** drop `@anthropic-ai/sdk` and `openai`.
- **Env vars:** drop `ANTHROPIC_API_KEY`, `AI_CREDENTIALS_ENCRYPTION_KEY`, `AI_BILLING_CIRCUIT_TTL_MS` and `OPENAI_API_KEY`. Also remove the `OPENAI_API_KEY` log line in `server.js`.

**Automations**
- **Built-in senders become the only path.** Remove the "a rule handles this, skip" checks in invoice, sale, job, quote, product, payment-reminder, job-tracking, order, assignee, task and rental senders, and remove `customerNotificationBridgeService.js`.
- **New built-in sender** for rental confirmation, handover and return.
- **Remove the backend engine and its plumbing:**
  - `automationEngineService.js`, `automationSchedulerService.js` (and its start in `server.js`), `defaultAutomationService.js`, `automationRecipientService.js`, `utils/automationBusinessType.js`
  - `controllers/automationController.js`, `routes/automationRoutes.js`
  - `scripts/ensure-default-automations.js`, `scripts/migrate-settings-to-automation-rules.js`
  - `taskAutomationService.js`, `autoTaskSchedulerService.js`, `utils/taskAutomationConfig.js`, and the calls to them
  - `POST /api/messages/birthday-setup`, and the "Enable birthday SMS" card in `Messages.jsx`
- **Remove the admin page:** `adminAutomationsController.js` and `AdminAutomationsMessaging.jsx`. Keep SMS usage: move `adminAutomationsMessagingService`'s usage numbers to another admin page, counting from message logs instead of `automation_runs`.
- **Remove the web UI:** `pages/Automations.jsx`, `components/automations/*`, `services/automationService.js`, `utils/automationForm.js`, `automationTemplatePreview.js`, `automationBusinessType.js` and `automationDelivery.js`, plus `/automations` in `App.jsx`, `navigation.js`, `sidebarMenus.js` and `appShellNav.js`.
- **POS:** drop `automationReceiptCoverage` from `getPOSConfig`, and its use in `receiptChannels.js`, `usePOSConfig`, `POSScanMode`, `POSReceiptModal` and `POS.jsx`.
- **Copy and links that point to `/automations`:** `SettingsInvoicesReceiptsSection`, `SettingsOrganizationSection`, `SettingsWhatsAppSection`, `OrganizationReviewShareSection`, `Messages.jsx` and `workspaceRoles.js`.
- **Database:**
  - Drop `automation_rules`, `automation_runs` and `automation_delayed_runs` (new migration), plus the models in `models/index.js` and the cleanup in `deleteTenantData.js`.
  - Remove the platform permission `automations.view`, `tenant.metadata.automationDefaults` and `automationsSeeded` in `tenantProvisioningService`.
  - Remove `/automations` and `/reports/smart-report` from `CONFIGURABLE_SIDEBAR_KEYS`, if Smart Report's sidebar entry changes.
- **Keep:**
  - `rentalAutomationService.js` creates rental invoices and keeps balances. It isn't an automation, so keep it and remove only its `runRental*Automations` calls.
  - `whatsapp_message_events`.
  - `customers.dateOfBirth`, which Lynk will need for birthdays.
  - The other crons: payment reminders, job due, rental notices, marketing campaigns, recurring journals, payouts, partner commission, Sabito.

**Event function (the future hand-off to Lynk)**
- **One function:** `Backend/services/businessEvents.js` → `emitBusinessEvent(tenantId, type, data)`. It does nothing yet. Each automation call site is replaced by a call to it.
- **Event list:** `sale.completed`, `order.created`, `order.status_changed`, `invoice.sent`, `invoice.paid`, `payment.received`, `quote.sent`, `quote.accepted`, `job.created`, `job.assigned`, `job.completed`, `lead.created`, `lead.assigned`, `customer.created`, `stock.low`, `stock.out`, `task.assigned`, `rental.created`, `rental.checked_out`, `rental.returned`, `rental.cancelled`. The list sits in that one file and is the contract with Lynk.
- **Scheduled cases need no event.** Birthdays, overdue invoices, inactive customers, daily summaries and expiring products are things Lynk works out by reading ABS data (Step 3).

**Watch**
- **Backend:**
  - Remove `services/watch*`, `controllers/watchController.js`, `watchAgentController.js`, `routes/watchRoutes.js`, `watchAgentRoutes.js`, `middleware/watchDeviceAuth.js`, `watchYoloTimeout.js`, the watch clip uploader, `config/watchConstants.js` and `utils/watch*` (`youtubeUrl.js` too, if Watch is its only user).
  - Drop the tables `vision_cameras`, `vision_events`, `vision_incidents` and `watch_devices`, plus `adminController`'s `VisionIncident` cleanup.
- **Python:** remove `vision-edge/` (181 MB of videos), `Backend/vision-edge/` and `yolov8n.pt`. They stay in git history; don't rewrite it.
- **Web:** remove `pages/Watch.jsx`, `components/watch/*`, `services/watchService.js`, `utils/watch*.js`, the nav entries, `LOCKED_SIDEBAR_KEYS` `/watch`, and the long-POST proxy handling in `vite.config.js`.
- **Native app:** remove `mobile/app/(tabs)/watch.tsx`, `services/watchService.ts`, `utils/watch.ts`, the More entry, and the intro slide (`IntroWatchHero`, `assets/intro/watch-large.png`).
- **Plans and storage:** remove `watch` from `config/features.js`, the plans and `businessTypes.js`; remove the `WATCH_*` env vars; empty the Watch S3 bucket and `uploads/watch`.

**Plans, pricing and copy**
- `config/features.js` and `config/plans.js` perks ("Advanced reporting & automation", "Automated reminders & notifications"); `SubscriptionPlan.marketing.featureFlags` and tenant `featureOverrides` that mention `automations` or `watch`.
- Marketing site: `app/smart-report/` ("Powered by AI"), `app/features/page.tsx` ("Claude-powered analysis"), `features/layout.tsx`, and the `lib/constants.ts` fallback pricing.
- Terms: `Frontend/src/pages/Terms.jsx` and `docs/ABS-Terms-and-Conditions.md` (AI and automation clauses).
- Docs: `docs/TOUR_TARGETS.md` (`reports-smart` step), `Backend/README.md`, `Backend/env.example`, `vision-edge` docs and the feature docs.
- Tests: remove or adjust the automation, AI and Watch tests. That is about 4,700 lines of backend tests, about 1,700 on web, and native `ibisChatPreferences`/`watch` tests. Several controller tests that mock these services need edits. Update `e2e/tests/helpers/mockApi.js`.
- One native app release: chat, Watch and the insight card go. Keep `mobile/__tests__/webParity.test.ts` passing.

**Done when:** desktop and the phone/tablet shell still pass (`e2e/playwright.mobile.config.js`, vitest, backend unit tests). Receipts, invoices, reminders and rental notices still go out with the switches on. No AI, automation or Watch entry is left in the web app, the native app, admin, the marketing site or the plans.

## Step 2: Lynk (all future work, in `SafeServer`)

1. **Update Lynk's plan first.** `docs/plan/lynk-plan.md` currently says "Is ABS part of Lynk for Business? No" and has nothing about powering ABS. "Where does ABS go when iCreations closes?" is still open. The plan is kept in step with the Claude Docs version, and other agents work from `docs/agents/board.md`.
2. **Link an ABS workspace to a Lynk business:** account, wallet, and who pays for SMS and AI. Today ABS tenants have no Lynk account, and Lynk API keys belong to a person.
3. **Receive ABS events.** `BusinessEvent` exists, but nothing can post into it yet.
4. **Run the advanced automations on ABS events and data.** The catalogue exists, but its runner reads Lynk tables (`lib/automations/run.ts`).
5. **"Ask Lynk" over ABS data.** The assistant (`lib/assistant/*`) needs a data source that reads ABS through the workspace key, plus a chat ABS can open. Today the chat works only inside a Lynk session.
6. **Insights over ABS data,** replacing the removed cards.
7. **Watch:**
   - Port the shop-PC agent from the tag above.
   - Clip processing needs Python. Lynk runs on Vercel, but already has a separate Python service (`services/converter`).
   - Matching camera events to sales uses `sale.completed`.

## Step 3: ABS connection (short, once Lynk can receive)

- `emitBusinessEvent` sends signed events to Lynk.
- **A workspace key for Lynk:** extend `/api/partner/v1` (today: `PARTNER_API_KEYS` env, `x-api-key`), so Lynk can:
  - read customers, sales, invoices, products and stock;
  - send messages through ABS's messaging, so ABS Credits and sender IDs keep working.
  - Pairing can follow the Watch agent's pairing-code pattern (in the tag above).
- **One "Lynk" entry in ABS, on web and in the native app.** It opens Lynk's pages for the workspace, already signed in. The `feature/lynk-mode` branch has sign-in-link and messaging code to reuse (`lynkConnectionService`, `lynkMessagingService`).
- After this, new AI, automation and Watch features ship on Lynk only. They need no ABS change and no app store release.
