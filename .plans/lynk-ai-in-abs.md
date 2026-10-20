# Lynk AI in ABS ("Ask Lynk")

**Status:** planned, 2026-10-20. Nothing is built yet.

**Decided (2026-10-20, by the owner):**
- **Where the AI runs:** Lynk runs it, and ABS shows Lynk's panel.
- **Paying:** each business's own Lynk wallet. It gets starter credit, then the owner tops up inside the panel.
- **Who:** owners and managers only. Staff don't get the panel.
- **Plans:** every ABS plan, paid per use.

This builds on `.plans/abs-simplify-lynk-powered.md` (Steps 2 and 3). That plan said ABS keeps one entry that opens Lynk, already signed in. This plan says what is in it and how the two connect.

## What businesses get

There is one **Lynk** button in ABS: in the web header and sidebar, and in the native app header. It opens Lynk beside the page you are on:
- **Desktop:** a panel on the right, about half the width. It can grow to a full page at `/lynk`.
- **Phones and tablets:** full screen.

In it, the owner or manager can:
1. **Ask about the business.** For example: "How did sales do this week?", "Who owes me?", "What sells best?" Answers use ABS's real numbers and link to the ABS page.
2. **See insights and suggestions.** The panel opens with what needs attention, with what to do about each:
   - sales dropping
   - stock running out
   - money owed
   - customers gone quiet
3. **Design a post.** Lynk makes a flyer or social post for a product or a promotion, using the business's logo, colours, products and prices from ABS. The owner downloads it or shares it.
4. **Bring in products from a spreadsheet.** The owner uploads any Excel or CSV file. Lynk then:
   - works out which column is which;
   - cleans up names, prices, units and categories;
   - flags duplicates;
   - shows a preview.

   On **Add**, the products go into ABS with their opening stock.

**Later:** asking Lynk to do things (record an expense, send a campaign), advanced automations on ABS events, and Watch.

## How it fits together (recommended)

**Lynk runs the AI. ABS supplies the data and shows Lynk's screen.**

- **Partner key.** ABS holds one Lynk partner key (the API key Lynk gives ABS, set in the server environment).
- **Switching Lynk on.** The owner switches Lynk on under Settings → Lynk. A plain note says what Lynk can see. ABS then asks Lynk to create or link a Lynk business for the workspace.
- **Opening the panel:**
  1. The ABS backend makes a short-lived **Lynk pass** for the signed-in user. It carries their role, workspace and shop.
  2. ABS sends the pass to Lynk, along with which page and record the user is on.
  3. Lynk returns an address that ABS shows in an iframe (web) or a WebView (native app).
  4. No cookies cross between the sites, because Safari and iOS block them in iframes. The pass travels with each request instead.
- **Lynk using ABS data.** Lynk reads and writes ABS through ABS's own API, using that pass:
  - only routes on an allow-list;
  - with the user's own role, so anything a staff member can't see in ABS, Lynk won't show them either;
  - every change is marked "by Lynk" in ABS's activity log.
- **Where data lives.** ABS data stays in ABS. Lynk keeps the conversation, not a copy of the business.
- **Paying for AI:** each business's Lynk wallet (starter credit, then top-ups in the panel).

**Why this way:** AI is built once, on Lynk, which was the 2026-10-18 decision. New Lynk features reach ABS businesses without an ABS change or an app store release.

**The alternative (not recommended):** ABS builds its own chat and calls Lynk's AI API with one key.
- **For it:** data never leaves ABS.
- **Against it:** ABS would rebuild the assistant, design and import that Lynk already has, and every change would need an ABS and app store release.

## What exists today

**Lynk** (`SafeServer`):
- **Assistant** (`lib/assistant/*`):
  - About 60 tools, streaming replies, the side-panel UI (`docs/plan/ask-lynk-side-chat.md`, built 2026-10-14), voice, undo, and cost per message.
  - **But** every tool reads and writes Lynk's own tables, and the chat only works inside a signed-in Lynk session (a cookie plus an origin check).
- **Insights** are rules, not AI: the `look_up` vocabulary over `lib/numbers/*`, and the suggestions catalogue (`lib/suggestions/*`). The AI only phrases the answer and never does the maths. Both read Lynk tables.
- **Design** makes flyers and social posts (`lib/design/*`):
  - Image models GPT Image 2 and Gemini, with a Claude art director and a text check.
  - Off by default (`LYNK_DESIGN_FOR_BUSINESSES`).
  - Reads brand and products from Lynk tables.
- **Product import:**
  - CSV only, with fixed header names.
  - An AI draft from a pasted list or a photo.
  - No Excel, no AI column matching, and no spreadsheets in chat.
- **API keys:**
  - Keys belong to a person, with scopes `sms`, `email`, `whatsapp`, `ai` and `images`.
  - There are no business keys, no embed mode and no outside data source.
  - Per-business keys and sealed screens are planned as "doors" and "windows" in `docs/plan/build-in-lynk.md`, marked "later".
- **Paying:**
  - The wallet belongs to a person; a wallet per business is planned.
  - The assistant gives each business starter credit, then charges the wallet per reply.
- **Lynk's plan** still says "Is ABS part of Lynk for Business? No" (`docs/plan/lynk-plan.md`, Decisions).

**ABS:**
- **Partner API.** `/api/partner/v1` has keys from an environment variable, one workspace each, and only a health check and the e-VAT summary.
- **Events.** `emitBusinessEvent` (`services/businessEvents.js`) knows 21 events, is called in about 26 places, and does nothing yet.
- **Product import** has a bug and several limits:
  - **The bug:** one bad row aborts the database transaction. Every later row then fails too, and the whole import is rolled back, yet the response says the earlier rows were created.
  - **Limits:** headers must match exactly, a file of more than 100 rows is refused, there are no variants, no opening stock entry is recorded, and unknown categories are dropped.
  - Fixed on 2026-10-20, apart from exact headers and variants. Matching messy columns is Lynk's job.
- **Reports and dashboard endpoints** already cover what "Ask" needs, behind a user login.
- **Missing:** posts or images, and a right-hand panel in the web layout.
- **The local branch `feature/lynk-mode`** has reusable code:
  - an encrypted store for Lynk keys (`lynkConnectionService`);
  - a Lynk API caller;
  - one-time sign-in links;
  - 10-minute owner tokens.

## Work in ABS (small)

1. **Fix product import now.** Built 2026-10-20 (not committed yet).
   - **Savepoints.** Each row in the shared bulk create, update and delete (`utils/bulkOperations.js`) runs in its own savepoint. This also fixes the same bug in customer, materials and equipment imports.
   - **The import service** (`services/productImportService.js`):
     - checks every row first;
     - skips repeats in the file and products already in ABS (by SKU, barcode, or name within the shop);
     - creates missing categories (optional);
     - accepts up to 2,000 rows;
     - records opening stock the way adding one product does;
     - stores `metadata.importBatchId` on each product.
   - **Routes:**
     - `POST /api/products/import/preview` changes nothing.
     - `POST /api/products/import` adds the products.
     - `DELETE /api/products/import/:batchId` undoes an import. It removes only products nothing has used yet, and lists the others with the reason they were kept.
   - **Input:** both routes accept a file or JSON `{ products: [...] }` with the template's keys, which is the way in for Lynk.
   - **Excel:** cells with formulas, dates and rich text are read as their values.
   - **Row numbers:** errors give the spreadsheet's own row numbers.
   - **Web:** the dialog now goes Check file → Add N products → Undo import.
   - **Tests:** backend unit tests and `e2e/tests/product-import.spec.js`.
2. **Lynk connection.** A new page, Settings → Lynk, for owners and admins:
   - switch on, with the consent note;
   - connection status;
   - disconnect.

   The link is stored encrypted, reusing the `lynkConnectionService` approach. A new feature key `lynk` in `config/features.js` handles plan gating.
3. **Lynk pass.** A short-lived token type (scope `lynk`, about 15 minutes, renewed while the panel is open). It works only on an allow-list:
   - **Read:** dashboard and reports; customers, sales, invoices, expenses and products; the business profile and logo.
   - **Products:** import preview and commit, and bulk create.

   Changes made with it are logged as "via Lynk".
4. **Panel:**
   - **Web desktop:** a right-hand panel in `MainLayout` that pushes the page aside. It switches between half and full width, Esc closes it, and `/lynk` opens it as a page.
   - **Phone and tablet shell:** full screen.
   - **Native app:** a screen with a WebView, which needs one app release.

   ABS tells Lynk which page and record is open, so "this" works. Links in Lynk's replies move the ABS page behind the panel, limited to allowed paths.
5. **Events (later step).** `emitBusinessEvent` sends signed events to Lynk through an outbox with retries.

## Work in Lynk (most of it)

1. **Update `lynk-plan.md`.** ABS becomes a connected product: ABS workspaces are linked Lynk businesses. Inside the ABS panel, Lynk may say "ABS".
2. **Partner link.** A partner key for ABS. Lynk creates or links a Lynk business for an ABS workspace, with its own wallet.
3. **Embed mode.** `/embed/ask` is the side chat without Lynk's own menus.
   - The session comes from the ABS pass, in a request header rather than a cookie.
   - `frame-ancestors` allows only ABS's domains.
   - A `postMessage` bridge carries page context and navigation.
4. **ABS data source.** An "ABS connector" behind the tools ABS businesses use:
   - `look_up` and `business_numbers` answered from ABS's report endpoints;
   - suggestion facts read from ABS;
   - product import that commits into ABS;
   - the design brief (name, logo, colours, products) read from ABS.

   Lynk-only tools (bookings, website, parcels and so on) are hidden for linked ABS businesses.
5. **Spreadsheet import with AI.** This helps Lynk's own businesses too.
   - It reads .xlsx, .xls and .csv files.
   - AI matches the columns and cleans the rows.
   - A preview card shows the fixes.
   - It commits in batches, to Lynk or to ABS.
6. **Design for ABS businesses.** Switch design on for linked businesses, with the brief read from ABS.
7. **Paying for AI:** charge the linked business's wallet (wallets move to one per business), and offer top-up inside the embedded panel.

## Order (each step ships on its own)

0. **ABS import fixes.** Built 2026-10-20 (see Work in ABS, item 1).
1. **Connect, the panel, and Ask** (read-only answers). This is the first thing businesses see.
2. **Spreadsheet import** into ABS.
3. **Insights and suggestions** in the panel, and later a slot on the ABS dashboard.
4. **Design a post.**
5. **Doing things** (record an expense, send a campaign), each with a confirm step and undo. Advanced automations on ABS events.
6. **Watch.**

## Risks

- **Two sites' sign-in meeting in an iframe.** Keep passes short-lived and allow-listed, and never use cookies. Test Safari and the iOS WebView early.
- **Wrong numbers lose trust.** Answers come from ABS's own report endpoints, the same numbers ABS shows, never from the AI doing sums.
- **A bad import.** Always preview before adding, and undo removes the whole import batch.
- **Privacy.** Lynk processes ABS data, so it needs consent at switch-on and an update to ABS's Terms (the AI clauses were removed on 2026-10-18).
- **Speed.** Each answer means Lynk calling ABS's API. ABS reports are already cached for 120–300 seconds.
- **Company questions still open** in `lynk-plan.md`: where ABS goes when iCreations closes, and the Paystack account.

## Decisions

All four are decided; see the top of this plan. Still open in Lynk's plan: where ABS goes when iCreations closes, and the Paystack account.
