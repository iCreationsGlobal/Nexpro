# Lynk AI product import in ABS

**Status (2026-10-24):** built on both sides; not live.
- **Lynk:** `ec35660` in `SafeServer` (`main`).
- **ABS:** on `abs-v2`, not pushed:
  - `533bf8c` the import;
  - `5a9cf6e` the undo fix;
  - `45d15b4` updates, and each import taken once;
  - `e8a0d9a` the phone app screen;
  - `4714a4e` photos.
- **Waiting on:** the Lynk key and settings (below) for a real test.

**The main plan is Lynk's:** `SafeServer/docs/plan/ai-product-import.md` (Lynk Product Import, a general Lynk API for any business app, ABS first). This file is ABS's side only. Lynk AI's Ask, Insights and Design are in `.plans/lynk-ai-in-abs.md`.

## How it works in ABS

1. **Products → Import → "Bring in with Lynk AI"** (owners and managers; web and phone app), or "Bring in products" from Lynk AI.
   - ABS's server starts an import on Lynk with ABS's key. It sends ABS's import template as its product details, its categories, units, the shops the person can manage, and its products (so Lynk spots repeats).
   - It allows updates (`can_update: true`).
   - It records the import in `lynk_imports`.
2. **Lynk's screen opens inside ABS:** a large window on the web, a WebView screen in the app. The owner gives a file (Excel or CSV in any layout, PDF, Word, a photo of a stock book), types, or talks. Lynk arranges the products, asks about gaps, and takes fixes.
3. **Lynk asks ABS to check the rows** (signed). ABS answers with its own preview rules. Products the owner chose to update count as fine to go in.
4. **Lynk sends the finished products** (signed). ABS takes them only for an import it started for that business, and claims it first, so two deliveries can't both add.
   - **New products:** added like ABS's own import, with opening stock; colours and sizes become variants.
   - **Products already in ABS that the owner chose to update:** their selling, cost and wholesale prices change, and their stock is set to the new count with an "import" stock entry. Matching colours and sizes get their own. The old values are kept for Undo.
   - **Stock entries:** recorded as the person who started the import, and marked "Lynk AI import".
   - **Photos:** fetched after ABS answers Lynk (below).
5. **ABS's window waits until the import is saved**, even when nothing new was added. It then shows what was added, updated and not brought in, with **Undo import**.
   - **Undo** removes the new products nothing has used, and puts back each updated price and count unless it changed again since (and says so).
   - **After Undo**, a late resend from Lynk is ignored.

**Who pays:** each ABS business is one "app user" on Lynk (its tenant id), with its own Lynk credit, bought inside the screen. It's the same credit as Lynk AI's.

## Photos and descriptions (Lynk's steps 3 and 4)

- **Descriptions** come through the template's Description column, which ABS's import already saves on the product.
- **Photos:** ABS takes `products[].photos` in the finished message: `[{ url }]` or plain addresses, at most five, the first being the main photo.
  - It fetches only https addresses on Lynk's host (`LYNK_URL`) or the hosts in `LYNK_PHOTO_HOSTS`, images only, up to 8 MB.
  - It keeps its own copies like an uploaded photo: slot A is the product's photo, B–E its online store photos.
  - A photo that fails is listed on the import and never fails it.
  - **Tell the Lynk session this format** (or agree another), so its photo step sends it.

## Settings ABS's server needs

| Setting | Value |
|---|---|
| `LYNK_URL` | Lynk's address: `https://www.lynkinfra.com` live, or the local Lynk for a local test |
| `LYNK_API_KEY` | A Lynk API key made on that same Lynk (Developer settings), with **Product import** and **Lynk AI in your app** access |
| `LYNK_IMPORT_SECRET` | The signing secret from Lynk → Developer settings → Product import (Lynk AI uses it too) |
| `API_PUBLIC_URL` | Where Lynk reaches ABS's server: `https://api.africanbusinesssuite.com` live. A local ABS needs a tunnel |
| `LYNK_PHOTO_HOSTS` | Optional: the storage host(s) Lynk's photo addresses use, if not Lynk's own |

Deploying also runs two new migrations: `create-lynk-imports` and `create-lynk-ai-sessions` (in `migrate.js`).

## Decided for ABS (owner, 2026-10-24)

- **The native app gets it in the first ABS release.** Built. It needs the app release (`react-native-webview`, the microphone permissions). Google Play's Data safety form needs "Voice or sound recordings".
- **Clothes: on a mannequin or dress form only, not on a person.** Lynk's plan, step 5, still says "a mannequin or a model". Tell the Lynk session.
- **Products already in ABS: Lynk asks whether to skip or update them.** Built.

## Left to do

- **A real test,** once the key exists: ABS (with a tunnel, or live) ↔ Lynk.
- **Lynk's steps 3–5** (photos, descriptions, clothes) are the Lynk session's. ABS's side of photos is ready for the format above.
- **New colours or sizes for a product already in ABS** aren't added by an update; Lynk says which were left out. Changing a product without variants into one with variants is a separate decision.
