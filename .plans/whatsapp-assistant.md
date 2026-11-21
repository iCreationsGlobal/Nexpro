<!-- Owner, 2026-11-21: businesses use ABS on WhatsApp for their own business questions and actions, by text or voice note; "Lynk is providing the AI". Then "Yes". Same plan in Lynk: SafeServer/docs/plan/whatsapp-assistant.md (keep both in step). -->

# Business owners on WhatsApp: Lynk AI behind ABS's number

**Status:** planned 2026-11-21; step 1 started.

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

## Suggested answers (owner to confirm)

1. Who: owners and managers for everything; cashiers for selling only.
2. Confirm before anything that records money or moves stock: always.
3. A PIN once a day before money figures (a phone number alone is weak proof).
4. ABS's Terms: a line that Lynk processes the business's data when it uses the AI (open since 2026-10-20; the owner's wording).
