# Lynk AI product import in ABS

**Status (2026-10-24):** Lynk's side and ABS's web side are built. Lynk: `ec35660` in `SafeServer`. ABS: `533bf8c`, merged into `abs-v2` (a fast-forward from `lynk-product-import`), plus an undo fix. Not pushed, not live. Waiting for the Lynk key and settings (below) for a real test.

**The main plan is Lynk's:** `SafeServer/docs/plan/ai-product-import.md` (Lynk Product Import, a general Lynk API for any business app, ABS first). This file is ABS's side only.

## How it works in ABS (as built)

1. **Products → Import → "Bring in with Lynk AI"** (owners and managers). ABS's server starts an import on Lynk with ABS's key. It sends:
   - ABS's import template as its product details;
   - its categories, units and the shops the user can manage;
   - its products (name, SKU, barcode), so Lynk spots repeats;
   - the check and finish addresses.
2. **Lynk's screen opens in a large window inside ABS** (an iframe with a one-time pass in its address; no cookies, no Lynk sign-in). The owner gives a file (Excel or CSV in any layout, PDF, Word, a photo of a stock book), types, or talks. Lynk arranges the products, asks about gaps, and takes fixes.
3. **Lynk asks ABS to check the rows** (`POST /api/webhooks/lynk/import-check`, signed). ABS answers with its own preview rules: codes already used, products already there, bad values.
4. **Lynk sends the finished products** (`POST /api/webhooks/lynk/import-finished`, signed). ABS adds them like its own import:
   - one batch per Lynk import (`lynk-<importId>`), so a resend adds nothing twice;
   - colours and sizes become variants, each with its own code, prices and opening stock.
5. **ABS's window waits until they're in**, then shows the usual import result with **Undo import** and "Now upload their photos".

**Who pays:** each ABS business is one "app user" on Lynk (its tenant id). It has its own Lynk credit balance and buys credit inside the screen. ABS gets no share for now (Lynk's decision, 2026-10-23).

## Settings ABS's server needs

| Setting | Value |
|---|---|
| `LYNK_URL` | Lynk's address. `https://www.lynkinfra.com` live; the local Lynk for a local test |
| `LYNK_API_KEY` | A Lynk API key with **Product import** access, made on that same Lynk (Developer settings) |
| `LYNK_IMPORT_SECRET` | The signing secret from Lynk → Developer settings → Product import |
| `API_PUBLIC_URL` | Where Lynk reaches ABS's server: `https://api.africanbusinesssuite.com` live. A local ABS needs a tunnel, or Lynk can't send the check and the products back |

Without the key and secret, the button answers "isn't set up yet" and nothing else changes.

## Decided for ABS (owner, 2026-10-24)

These came after Lynk's plan was written. Lynk's plan doesn't have them yet.
- **The native app gets it in the first ABS release**, with the web: a WebView screen, the button on Products, and the iPhone microphone permission. One app release.
- **Clothes: on a mannequin or dress form only, not on a person.** Lynk's plan, step 5, still says "a mannequin or a model". Lynk's plan needs changing before step 5 is built.
- **Products already in ABS: Lynk asks whether to skip them or update them.** As built, ABS starts imports with `can_update: false`, so repeats are always skipped. ABS needs an update path (below).

## Left to do in ABS

1. **Updates.** Send `can_update: true`. Take Lynk's changes to existing products (price, cost, stock, photos) in the finished message. Set stock to the new count through a stock adjustment ("Stock from import"). Keep the old values in the batch, so **Undo import** puts them back.
2. **The native app:**
   - a Lynk screen with `react-native-webview`, opened from Products;
   - it must listen for Lynk's "finished" and "closed" messages, as the web dialog does;
   - it must allow choosing files and taking photos;
   - the iPhone microphone permission (`NSMicrophoneUsageDescription`), and the WebView's microphone grant.
3. **Photos, descriptions and clothes (Lynk steps 3–5).** When Lynk sends photos and descriptions, ABS saves the photos into its own storage (`imageUrl` and image slots) and the descriptions on the product, plus the store listing if the business has an online store.
4. **Small things from the review:**
   - **A finish where nothing was added** (all skipped) leaves ABS's window waiting 90 seconds and then saying the products aren't in yet. It should say "nothing new to add".
   - **Lynk's signature has no time in it**, so a copied message could be sent again. A resend of the same import adds nothing while its batch is there, but after **Undo import** it would add the products again. Lynk sends `X-Lynk-Delivery`; ABS could remember the deliveries it has handled, or Lynk could sign a timestamp.
   - **Changes made through Lynk** aren't marked "via Lynk" in ABS's activity log yet.

## Fixed during the merge (2026-10-24)

**Undo and variants.** Undo is meant to keep a product that was given a new colour or size after the import. Its query was `NOT (metadata->>'importBatchId' = batch)`, which is never true for a variant without a batch id (SQL's NULL). So undo would have deleted the product, with the variants the owner had added. It now asks for "another batch, or none" (`services/productImportService.js`, with a test).
