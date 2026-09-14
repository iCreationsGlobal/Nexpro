---
name: Mobile Bluetooth ESC/POS thermal printer support
overview: Web and mobile now both support A4/58mm/80mm invoice printing via HTML/CSS page sizing (works for OS-registered printers — AirPrint, Android print service). Generic Bluetooth "dumb" ESC/POS receipt printers (no OS driver — common, cheap hardware) still cannot be reached from mobile at all. This plan scopes that separate, bigger integration.
todos:
  - id: p0-hardware-confirm
    content: Confirm with real shop users which printer models they actually have (brand/model) before picking an SDK — determines whether ESC/POS-over-Bluetooth-SPP is even the right target vs. some printers already being AirPrint/Android-print-service capable
  - id: p0-sdk-pick
    content: Evaluate a React Native ESC/POS Bluetooth library (device discovery, pairing, raw byte send) compatible with the Expo config in this app; confirm it works with a bare/dev-client build (native module, not Expo Go)
  - id: p1-printer-setting
    content: Add a per-shop "paired printer" setting (device id/name), persisted like other workspace settings, with a pairing/selection UI
  - id: p1-connection-management
    content: Connect/reconnect/error handling for a flaky Bluetooth link (printer off, out of range, mid-print disconnect) with clear user-facing errors
  - id: p1-escpos-renderer
    content: New receipt template renderer that outputs ESC/POS byte commands (text, bold, cut, line feed) instead of HTML — cannot reuse buildPrintableInvoiceHtml/printableInvoiceHtml.ts, which target a WebView PDF renderer, not a raw byte stream
  - id: p1-wire-print-action
    content: Route the existing "Print Invoice" action (mobile/app/invoice/[id].tsx → printInvoice) to the ESC/POS path when a Bluetooth printer is paired, falling back to the existing Print.printAsync (OS print dialog) path otherwise
  - id: p2-receipt-parity
    content: Once invoices work, extend the same renderer to sale receipts (mobile/utils/formatSaleReceipt.ts is a plain-text share formatter today, not a print target — needs its own ESC/POS pass)
---

# Mobile Bluetooth ESC/POS thermal printer support

## Why this is separate from the work already shipped

Shop owners in Ghana commonly use cheap 58mm/80mm receipt printers that pair over **Bluetooth SPP with no OS driver** — they never appear in the phone's native print dialog. Expo's `expo-print` (used everywhere in this app today) can only print to something the OS already recognizes as a printer (AirPrint, Android print service). There is no way to reach a driverless Bluetooth printer through it. Reaching one requires a dedicated native Bluetooth module that talks raw ESC/POS bytes — a fundamentally different code path from anything in this app's printing stack today.

## What's already done (context, not part of this plan)

Web and mobile invoice printing now both support A4/58mm/80mm via HTML/CSS page sizing, for printers already registered with the OS:

| Piece | What it does |
|-------|--------------|
| [Frontend/src/utils/printStyles.js](Frontend/src/utils/printStyles.js) | Shared `getPrintStyles(printConfig)` — page width/content width/font sizing per format. Used by both `PrintableInvoice.jsx` and `PrintableReceipt.jsx`. |
| [Frontend/src/pages/Invoices.jsx](Frontend/src/pages/Invoices.jsx) | Print dialog now reads the saved format via `usePOSConfig()` and passes it to `PrintableInvoice`; Download button resizes the PDF (`Frontend/src/utils/pdfUtils.js` `contentWidthMm`/`dynamicHeight` options) to match. |
| [mobile/utils/printableInvoiceHtml.ts](mobile/utils/printableInvoiceHtml.ts) | `buildPrintableInvoiceCss(printFormat)` appends thermal-width CSS overrides (narrow width, smaller fonts, grayscale, hidden logo) on top of the base A4 styles. |
| [mobile/hooks/usePrintFormat.ts](mobile/hooks/usePrintFormat.ts) | Reads the same `pos-config` setting web uses, so both platforms agree on the chosen format. |
| [mobile/services/pdfDocumentService.ts](mobile/services/pdfDocumentService.ts) `printInvoice()` | Calls `Print.printAsync({ html })` — opens the native print dialog, which will show an AirPrint/Android-print-service printer if one is set up. |
| [mobile/app/invoice/\[id\].tsx](mobile/app/invoice/[id].tsx) | "Print Invoice" is always in the More menu regardless of invoice status, and uses the saved format. Download/Share PDF stays A4 always, deliberately, regardless of the print-format setting. |

This all still routes through Expo's HTML→PDF→OS-print pipeline. None of it reaches a driverless Bluetooth printer.

## Open product question (blocks p0)

We don't yet know which printer hardware shop users actually have. Before picking a Bluetooth SDK, confirm: are these genuinely driverless ESC/POS-over-Bluetooth-SPP devices (the common cheap ones), or do some already show up as AirPrint/Android-print-service printers (in which case the work already shipped covers them and this plan only matters for the rest)?

## Scope once hardware is confirmed

1. **Printer pairing & settings** — a paired-device picker per shop/workspace (device discovery, remembered selection), since there's no concept of "this shop's printer" in the app today.
2. **Connection management** — Bluetooth links drop; need reconnect logic and honest error states, not silent failures.
3. **ESC/POS renderer** — a new template that emits raw byte commands (text formatting, cut, feed) for the invoice/receipt content, separate from the existing HTML generators. `buildPrintableInvoiceHtml` cannot be reused here; it targets a WebView PDF renderer, not a byte stream.
4. **Wire into the existing Print action** — `printInvoice()` should try the paired Bluetooth printer first (if one is set) and fall back to the OS print dialog otherwise, so the UI entry point (`app/invoice/[id].tsx`'s "Print Invoice") doesn't need to change.
5. **Sale receipts, later** — `mobile/utils/formatSaleReceipt.ts` today only produces a plain-text string for SMS/WhatsApp sharing; it isn't a print target. Once invoices work over Bluetooth, receipts need their own pass.

## Explicitly not doing yet

- Not picking a library or writing any native code until p0 (hardware confirmation) is answered.
- Not touching the web app — this is mobile-only, since web has no Bluetooth story and its OS-driver-based printing already works.
