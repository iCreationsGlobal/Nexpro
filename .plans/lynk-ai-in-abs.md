# Lynk AI in ABS ("Ask Lynk")

**Status:** planned, 2026-10-20; updated 2026-10-23 after checking Lynk again. Step 0 (the ABS import fix) is done (`7dc9f55`). Nothing else is built.

**Decided (2026-10-20, by the owner):**
- **Where the AI runs:** Lynk runs it, and ABS shows Lynk's screens.
- **Paying:** each business's own Lynk wallet. It gets starter credit, then the owner tops up inside Lynk AI.
- **Who:** owners and managers only. Staff don't get Lynk AI.
- **Plans:** every ABS plan, paid per use.

**Decided (2026-10-23, by the owner):**
- **Lynk's screens inside ABS, not ABS's own.** ABS shows Lynk's Ask, Design and Import screens; data moves between the two servers by API. ABS does not rebuild the chat, voice or design.
- **A Lynk AI page with tabs, and a side panel, both in the first step.** The page has Ask, Insights, Design and Import tabs. The side panel is Ask beside any ABS page, so "this invoice" works.

This builds on `.plans/abs-simplify-lynk-powered.md` (Steps 2 and 3). That plan said ABS keeps one entry that opens Lynk, already signed in. This plan says what is in it and how the two connect.

## What businesses get

**The Lynk AI page** (`/lynk`), with four tabs and the AI credit at the top (with Top up):

```
┌───────────┬──────────────────────────────────────────────┐
│ Dashboard │ Lynk AI                 AI credit 4.20 Top up │
│ ✦ Lynk AI │  Ask   Insights   Design   Import             │
│ Sales     │ ──────────────────────────────────────────── │
│ Products  │  What do you want to know?                    │
│ …         │  [Sales this week] [Who owes me?] [Best sellers]│
│           │  ┌───────────────────────────────┐ 📎 🎙 ◉    │
│           │  │ Ask Lynk anything…            │            │
└───────────┴──────────────────────────────────────────────┘
```

1. **Ask.** Chat and voice about the business: "How did sales do this week?", "Who owes me?", "What sells best?" Answers use ABS's real numbers and link to the ABS page. Voice note, voice mode (talking live), photos by the paperclip, as in Lynk.
2. **Insights.** What needs attention, with what to do about each:
   - sales dropping
   - stock running out
   - money owed
   - customers gone quiet

   Each has "Ask about this" and a button to the ABS page.
3. **Design.** Lynk's design screens, with the business's logo, colours, products and prices from ABS:
   - the gallery: Ready designs and Your flyers, by kind of business and occasion;
   - Make it mine: the design on the left, Lynk asking goal, detail, direction and size on the right, then a plan card and Generate;
   - the result after about 1–2 minutes: change it by chat, other sizes (portrait, square, story, wide), Download PNG or PDF, Share on WhatsApp.
4. **Import.** The owner uploads any Excel or CSV file. Lynk then:
   - works out which column is which;
   - cleans up names, prices, units and categories;
   - flags duplicates;
   - shows a preview.

   On **Add**, the products go into ABS with their opening stock. Undo removes the whole import.

**The side panel (Ask only).** A ✦ button in the ABS header opens Ask beside the page you are on.
- **Desktop:** a panel on the right that pushes the page aside. Lynk knows which page and record is open ("this invoice"). Links in replies move the ABS page behind the panel. "Open full page" goes to `/lynk` with the same conversation.
- **Phones and tablets (web):** the ✦ button opens the Lynk AI page full screen, carrying the page you came from. The bottom bar's five slots are already taken, so Lynk AI is not a bottom tab; it is also in the More sheet.
- **Native app:** the ✦ button in the header opens a Lynk AI screen (full screen, the same four tabs), carrying the screen you came from.

**Where it is listed:** the desktop sidebar ("Lynk AI"), the header ✦ button (web and native), and the More sheet on phones.

**Later:** asking Lynk to do things (record an expense, send a campaign), advanced automations on ABS events, and Watch.

## How it fits together

**Lynk runs the AI and draws the screens. ABS supplies the data and holds the frame.**

- **Partner key.** ABS holds one Lynk partner key (set in the server environment). Lynk holds one ABS key to call ABS back.
- **Switching Lynk on.** The owner switches Lynk on under Settings → Lynk. A plain note says what Lynk can see. ABS then asks Lynk to create or link a Lynk business for the workspace, with its own wallet.
- **Lynk at an ABS address.** Lynk's screens for ABS are served at an ABS subdomain, for example `ai.africanbusinesssuite.com`, pointed at Lynk's server. It is then the same site as `myapp.africanbusinesssuite.com`, so Lynk's sign-in cookie works inside the frame on Safari and iPhones, and Lynk's screens work unchanged (they use cookies and Next server actions). Lynk already serves businesses' own domains, so this is a known path.
- **Opening Lynk AI:**
  1. The ABS backend asks Lynk (server to server, partner key) for a one-time sign-in code for the signed-in user. It carries their role, workspace and shop.
  2. The frame (web) or WebView (native) loads `ai.…/abs/start?code=…`, which signs them in to their linked Lynk business and opens the page or panel.
  3. ABS tells Lynk which page and record is open, through `postMessage` (web) or the WebView bridge (native).
- **Lynk using ABS data.** Lynk reads and writes ABS through ABS's own API with a short-lived **Lynk pass** for that user:
  - only routes on an allow-list;
  - with the user's own role, so anything a staff member can't see in ABS, Lynk won't show them either;
  - every change is marked "by Lynk" in ABS's activity log.
- **Where data lives.** ABS data stays in ABS: customers, sales, invoices and stock are read live. Lynk keeps the conversation, and a copy of the business profile only (name, logo, colours, phone, address, socials), kept in step with ABS, because design reads it from Lynk.
- **Paying for AI:** each business's Lynk wallet (starter credit, then top-ups in Lynk AI).

**Why this way:** AI is built once, on Lynk, which was the 2026-10-18 decision. New Lynk features reach ABS businesses without an ABS change or an app store release. Lynk changes many times a day; ABS screens of their own would always lag.

**The alternative (turned down 2026-10-23):** ABS draws its own screens and calls Lynk's API. ABS would rebuild the chat (about 18 card types), live voice (hard in the native app) and the whole design flow, and every Lynk change would need an ABS and app store release.

## What Lynk has today (checked 2026-10-23)

Since 2026-10-20 nothing Lynk offers outside apps has changed: the developer API, keys, wallets and product import are as they were. Paths are in `SafeServer`.

- **The business assistant ("Lynk AI"):**
  - `POST /api/assistant/chat` streams the reply as one JSON event per line: status, text, cards, done (with the cost). Claude (Haiku 5.5 by default, Sonnet 5.5 for harder asks), up to 10 tool steps, about 90 tools for an owner.
  - Cards: suggestion, link, items, confirm, choices, done (with undo), credit, picture, flyer and more (`components/lynk/chat/cards.tsx`).
  - Page context turns the open page into words (`lib/assistant/page-context.ts`); conversations, memory, undo and photos all exist.
  - Confirm, undo and the conversation list are Next server actions, not REST.
  - Sign-in is the Lynk session cookie only (SameSite=Lax), plus an origin check; 20 a minute, 400 a day per person.
  - Every tool reads and writes Lynk's own tables.
- **Voice:**
  - Live voice is OpenAI's `gpt-realtime` over WebRTC, started from `POST /api/lynk/voice/session`. The browser hands every question to the same chat route through one `ask_lynk` tool, so voice and text are the same brain.
  - Without live audio: record, then written out (`gpt-4o-mini-transcribe`), then spoken back (`gpt-4o-mini-tts`).
  - 10 free minutes per business, then 8¢ a minute, 30 minutes a call.
  - When Lynk opens a page, voice shrinks to a small bar and keeps talking.
- **Design:** Grow → Designs (gallery), Make it mine (two panels, plan card), the result page with sizes and downloads. The art director is Claude; pictures come from the owner's ChatGPT helper on Lynk's server. It is off by default (`LYNK_DESIGN_FOR_BUSINESSES`) and can only be started from inside Lynk (server actions). Each design reads the brief from Lynk's tables (`businessBrief`).
- **Product import:** CSV only, fixed headers, up to 2,000 rows, plus an AI draft from a list or photo. No Excel library, no AI column matching, no spreadsheets in the chat.
- **Insights:** `lib/numbers/*` has the sums (sales against the last period, best sellers, low stock, money owed, lapsed customers). There is **no** "needs attention" feed yet. `lib/suggestions` is setup tips ("add a logo"), not business alerts, which corrects the 2026-10-20 version of this plan.
- **Developer API (`/api/v1`):** keys belong to a person (scopes `sms`, `email`, `whatsapp`, `ai`, `images`). Its AI routes are a plain model gateway: no business data, tools or streaming. Not usable for this.
- **The old app runtime's owner-token route** (`/api/lynk/v1/apps/*`) still exists, but that runtime was retired on 2026-10-08. Don't build on it.
- **Framing:** Lynk sends no frame-ancestors or X-Frame-Options at all (any site can frame it today), and no CORS on the assistant.
- **Wallets** are still per person; a wallet per business is decided but not built.
- **Lynk's plan** still says "Is ABS part of Lynk for Business? No" (`docs/plan/lynk-plan.md`, Decisions). It is a synced copy of a Claude Doc: change the Doc.

## What ABS has today

- **Partner API.** `/api/partner/v1` has keys from an environment variable, one workspace each, and only a health check and the e-VAT summary.
- **Events.** `emitBusinessEvent` (`services/businessEvents.js`) knows 21 events, is called in about 26 places, and does nothing yet.
- **Product import** was fixed in `7dc9f55`: it checks first, skips duplicates, takes up to 2,000 rows, records opening stock, and can be undone by batch. `POST /api/products/import/preview` and `POST /api/products/import` accept JSON `{ products: [...] }`, which is Lynk's way in.
- **Reports and dashboard endpoints** already cover what Ask and Insights need, behind a user login.
- **Layout:** no right-hand panel in `MainLayout` yet. The bottom tab bars (web `config/appShellNav.js`, native `mobile/app/(tabs)/_layout.tsx`) have all five slots taken.
- **Native app:** no WebView package and no iPhone microphone permission (`NSMicrophoneUsageDescription`); Android already has `RECORD_AUDIO`.
- **The local branch `feature/lynk-mode`** has reusable code: an encrypted store for Lynk keys (`lynkConnectionService`), a Lynk API caller, one-time sign-in links, and 10-minute owner tokens.

## Work in ABS (small)

1. **Fix product import.** Done (`7dc9f55`).
2. **Lynk connection.** Settings → Lynk, for owners and admins: switch on with the consent note, connection status, disconnect. The link is stored encrypted, reusing the `lynkConnectionService` approach. A new feature key `lynk` in `config/features.js`.
3. **Lynk pass.** A short-lived token type (scope `lynk`, about 15 minutes, renewed while Lynk AI is open), only on an allow-list:
   - **Read:** dashboard and reports; customers, sales, invoices, expenses and products; the business profile and logo.
   - **Products:** import preview and commit.

   Changes made with it are logged as "via Lynk".
4. **Sign-in code.** A backend route that asks Lynk for the one-time code for the signed-in owner or manager and returns the address to load.
5. **The Lynk AI page** (`/lynk`): ABS's page shell holding Lynk's tabbed screen in a frame (`allow="microphone"` for voice). Sidebar item, More sheet item.
6. **The side panel:** a right-hand panel in `MainLayout`, opened by the header ✦ button, that pushes the page aside and stays open while the ABS page changes. It sends the page and record to Lynk and follows Lynk's links (allowed paths only). Esc closes it. On phones the button opens `/lynk` instead.
7. **Native app:** a Lynk AI screen with a WebView (`react-native-webview`), the header ✦ button, the iPhone microphone permission and the WebView's microphone grant. One app release.
8. **Terms:** a clause on Lynk processing ABS data (the AI clauses were removed on 2026-10-18).
9. **Events (later step).** `emitBusinessEvent` sends signed events to Lynk through an outbox with retries.

## Work in Lynk (most of it)

1. **Update Lynk's plan (the Claude Doc).** ABS becomes a connected product: ABS workspaces are linked Lynk businesses. Inside ABS, Lynk may say "ABS".
2. **Partner link.** A partner key for ABS. Lynk creates or links a Lynk business for an ABS workspace, with its own wallet, and keeps its profile (name, logo, colours, phone, address, socials) in step with ABS.
3. **Sign-in from ABS.** A one-time code that ABS's server asks for and the frame redeems, setting Lynk's session for the linked business.
4. **The ABS address.** Serve Lynk at `ai.africanbusinesssuite.com` (DNS from the owner). There, `frame-ancestors` allows only ABS's web addresses. Lynk's own app also gets a `frame-ancestors 'self'` rule, which closes today's framing gap.
5. **Screens for ABS:**
   - the Lynk AI page with the Ask, Insights, Design and Import tabs and the credit;
   - the Ask panel (the existing side chat, without Lynk's own menus);
   - a bridge for page context and links (`postMessage` on the web, the WebView bridge in the app).
6. **ABS data source.** An "ABS connector" behind the tools ABS businesses use:
   - `look_up` and `business_numbers` answered from ABS's report endpoints;
   - customers, sales, invoices and products found in ABS;
   - `open_page` opening ABS pages;
   - page context for ABS pages.

   Lynk-only tools (bookings, website, parcels and so on) are hidden for linked ABS businesses.
7. **Insights.** A "needs attention" feed (sales dropping, stock running out, money owed, customers gone quiet) from ABS's numbers. Lynk's own businesses can use it too, from `lib/numbers`.
8. **Spreadsheet import with AI.** Reads .xlsx, .xls and .csv; AI matches the columns and cleans the rows; a preview card shows the fixes; it commits to Lynk or to ABS (through ABS's import routes).
9. **Design for ABS businesses.** Switch design on for linked businesses; the brief comes from the synced profile and ABS's products.
10. **Paying for AI:** charge the linked business's wallet (wallets move to one per business), with top-up inside Lynk AI.

## Order (each step ships on its own)

**Changed 2026-10-24 by the owner:** AI product import (with photos, descriptions and clothes) comes first, before anything else here.

It was built a different way from this plan. It uses Lynk's general **Product Import API**:
- ABS's server holds a Lynk API key;
- each ABS business is an "app user" with its own Lynk credit, bought inside the screen;
- Lynk's screen opens with a one-time pass in its address;
- Lynk sends signed checks and the finished products to ABS.

There is no Settings → Lynk, no Lynk pass into ABS's API, and no subdomain. See `.plans/lynk-ai-product-import.md` and Lynk's `docs/plan/ai-product-import.md`. Re-plan the steps below on that model before building them.

0. **ABS import fixes.** Done (`7dc9f55`).
1. **AI product import** (`.plans/lynk-ai-product-import.md`): web built and merged into `abs-v2` (2026-10-24). Still to do: updates to existing products, the native app screen, then photos, descriptions and clothes.
2. **The Lynk AI page, the side panel, and Ask** (text and voice, read-only answers). Import moves into the page's Import tab; the other tabs show "Coming soon" until their step ships.
3. **Insights.** Later, a slot on the ABS dashboard too.
4. **Design.**
5. **Doing things** (record an expense, send a campaign), each with a confirm step and undo. Advanced automations on ABS events.
6. **Watch.**

## Risks

- **Voice in a frame and a WebView.** The microphone must be allowed by the frame, and by the WebView in the app (iPhone WebRTC in a WebView is the weakest spot). Test live voice on Safari, an iPhone and Android early; voice notes and the record-then-answer mode are the fallback.
- **Signing in across two products.** Codes are one-time and short-lived; the Lynk pass is short-lived and allow-listed. Serving Lynk at an ABS subdomain keeps it to the same site, so there are no third-party cookies.
- **Wrong numbers lose trust.** Answers come from ABS's own report endpoints, the same numbers ABS shows, never from the AI doing sums.
- **A bad import.** Always preview before adding; undo removes the whole import batch.
- **Privacy.** Lynk processes ABS data, so it needs consent at switch-on and the Terms update.
- **Speed.** Each answer means Lynk calling ABS's API. ABS reports are already cached for 120–300 seconds.
- **Company questions still open** in Lynk's plan: where ABS goes when iCreations closes, and the Paystack account.

## Before Lynk work starts

- Another session has uncommitted voice work in `SafeServer` (`lib/voice/`, `lib/business/talk-button.ts`, the live-voice files). Finish and commit it first.
- The owner sets up DNS for the ABS subdomain when step 1 is ready to test.
