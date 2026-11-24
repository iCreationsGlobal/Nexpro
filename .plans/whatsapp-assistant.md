<!-- Owner, 2026-11-21: businesses use ABS on WhatsApp for their own business questions and actions, by text or voice note; "Lynk is providing the AI". Then "Yes". Same plan in Lynk: SafeServer/docs/plan/whatsapp-assistant.md (keep both in step). -->

# Business owners on WhatsApp: Lynk AI behind ABS's number

**Status (2026-11-24):** step 2 (questions, text and voice) is built in ABS on `abs-v2`, switched off, not live. Lynk needed no change for it. Step 1's Lynk side is **LIVE in e75b10a** (2026-11-21); ABS's live server needs its Lynk key.

**Owner's decisions (2026-11-24, "yes to all"):** start with questions; owners and managers (cashiers, selling only, later); always Confirm before recording money or moving stock; a PIN once a day; the name shown on WhatsApp is "ABS".

## The idea

An ABS business owner chats with ABS on WhatsApp, typing or sending a voice note: "Who owes me money?", "How much came in today?", "Sell a Coca-Cola to Kwame Ansah". The answers come from the business's own ABS numbers; a sale is recorded in ABS after the owner taps Confirm.

**ABS owns the WhatsApp number, the person and the data; Lynk is the brain behind it.** The same split as Lynk AI in ABS on the web (`lynk-ai-for-apps.md`), with WhatsApp as the screen.

## How one message flows

1. The owner messages ABS's WhatsApp number (+233 50 589 6162, WABA "ICreations Global"; Meta setup in `~/Documents/ABS-WhatsApp-Cloud-API-Handover.pdf`).
2. Meta posts it, signed, to ABS's webhook. ABS works out who it is: a phone linked to an ABS user (owner or manager) and their business. A voice note's audio is fetched from Meta.
3. ABS opens or reuses a Lynk AI session for that person and business (Lynk AI for apps) and passes the words or the audio.
4. Lynk AI understands it, asks ABS what it needs through the signed bridge (`POST {ABS}/api/webhooks/lynk/ask`: money owed, sales, customers, products…) and answers, or prepares an action.
5. ABS sends the reply on WhatsApp: short text, up to three buttons, lists. An action comes back as "Sell 1 Coca-Cola (GH₵ 10) to Kwame Ansah, paid in cash?" [Confirm] [Change] [Cancel].
6. On Confirm, ABS records it as that person ("by Lynk AI on WhatsApp"), by ABS's own rules (stock, receipts, staff rights), and can send the customer their receipt (template `abs_payment_receipt`, when they agreed to WhatsApp).

Lynk never reads or writes ABS's database; it only asks through the bridge.

## What each side builds

**Lynk:** merge and release Lynk AI for apps (step 1); take a voice note's audio (Lynk already turns speech into text); ABS's actions as Lynk AI tools with follow-up questions ("How many? Cash or mobile money? Paid now or on credit?"); a reply format for WhatsApp (short text, ≤ 3 buttons, lists).

**ABS:** the WhatsApp webhook (signature required, fast 200, duplicates ignored, the business found from the sent message on record); "Connect my WhatsApp" (a phone linked to the ABS user with a code); passing messages to Lynk and sending replies with buttons; actions on the bridge (find a customer or product, record a sale, an expense, a customer's payment), each only after Confirm, as that user, with Undo for a while.

## Cost and rules

- Replies within 24 hours of the owner's message are free from Meta (a service conversation).
- The AI is paid from the business's Lynk credit (as Lynk AI in ABS).
- Meta allows business-specific assistants only (since 15 Jan 2026): this one answers about the owner's own business, nothing general.

## Steps

1. **The bridge live:** merge Lynk's `lynk-ai-for-apps` (9512390, its migration renamed after the newest) into `main` and release it; release ABS's Lynk AI (`abs-v2`: the import and Ask commits) to ABS's `main`; ABS's Lynk key with "Lynk AI in your app" access set on ABS's server. Proven on the web with real businesses before WhatsApp depends on it.
2. **Questions on WhatsApp**, text and voice: read-only (who owes, today's money, best sellers, low stock).
3. **Actions with Confirm:** sell, expense, a customer's payment, the customer's receipt.
4. **Later:** a morning summary (needs one more approved template); the same for Lynk's own businesses on Lynk's own number (Lynk AI already sells and answers there).

Before step 2, on Meta's side (the owner): billing (currency and a card on the WhatsApp account; until then templates fail with 131042), the credentials on ABS's server only, rotate them, record the two-step PIN, then point the webhook at ABS.

## As built: questions (ABS)

- **Connecting:** Settings → ABS on WhatsApp. They choose a PIN and get a message to send ("Connect ABS 7K4M-9QX2"; 15 minutes, once). Sending it from their WhatsApp proves the phone is theirs. One phone for one person.
- **The PIN** is typed on ABS's own page (`/wa/<one-time link>`), not in the chat, where it would stay readable. It opens the chat for 24 hours, and what they asked before it is then answered. Five wrong PINs lock it for an hour and tell them in ABS.
- **The menu is free:** today's sales, against yesterday, stock, best sellers, who owes me (by customer), profit, expenses, change shop or business, lock. It's answered straight from ABS's reports (`lynkAsk.js`), with no AI.
- **Their own words, typed or spoken,** go to Lynk AI with the pass of a session ABS opens (`lynkChat.js`: `/api/app-ai/<pass>/chat` and `/transcribe`), and cost the business's Lynk credit. The same conversation shows in Lynk AI on the web.
- **Every message:** Meta's signature, once only, not older than 30 minutes, the person's rights checked again, 15 a minute and 300 a day. A phone that isn't connected gets at most 5 replies an hour, with no business details.
- **Not kept:** the words of a message (only Meta's message id, to answer once), except one asked while locked, until it's answered.
- **Files:** `services/absWhatsApp.js` (the number), `whatsappLinks.js` (phones and PINs), `whatsappAssistant.js` (the chat), `lynkChat.js`; `controllers/whatsappAssistantController.js`; migration `create-whatsapp-assistant.js`; web `SettingsAbsWhatsAppSection.jsx` and `WhatsAppUnlock.jsx`.
- **Closed at the same time:** the WhatsApp webhook took unsigned messages. With `WHATSAPP_APP_SECRET` set it refuses them.

**To switch on**
1. Meta: card and currency, new keys, two-step PIN; the display name "ABS".
2. ABS's live server: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (one that doesn't expire), `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `ABS_WHATSAPP_NUMBER`, `ABS_WHATSAPP_ASSISTANT=true`; `LYNK_API_KEY`, `LYNK_IMPORT_SECRET` and `API_PUBLIC_URL` for typed and spoken questions.
3. Deploy the API (it has a migration) and publish the dashboard.
4. Meta: point the webhook at `<API>/api/webhooks/whatsapp`, field `messages`.

**Next (actions):** bring only `lynkActions.js`, `LynkAction` and its route from `../Nexpro-lynk-one` into `abs-v2` (its marketing removal stays there); Lynk AI needs the "prepare and confirm" step and `actOnApp` (`../SafeServer-apps`). Restock orders need purchase orders in ABS first.

## Still open (owner)

ABS's Terms: a line that Lynk processes the business's data when it uses the AI (open since 2026-10-20; the owner's wording). The connect screen says it in plain words.
