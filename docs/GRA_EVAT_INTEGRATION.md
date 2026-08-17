# GRA e-VAT integration guide (ABS)

This document frames Phase 0 of ABS ↔ Ghana Revenue Authority (GRA) e-VAT work: access, consent, and certification readiness. **e-VAT is certified invoice stamping (VSDC), not the monthly VAT return form.**

## Official resources

- [GRA E-VAT service page](https://gra.gov.gh/e-services/e-vat/)
- [E-VAT Guidelines (PDF)](https://gra.gov.gh/wp-content/uploads/2024/07/E-VAT-GUIDELINES_20240222.pdf)
- [How to integrate an existing sales system](https://evatgra.zendesk.com/hc/en-us/articles/10990923915549-How-do-I-integrate-my-existing-sales-system-with-EVAT)
- [E-VAT API Integration Document](https://evatgra.zendesk.com/hc/en-us/articles/34826329238941-E-VAT-API-INTEGRATION-DOCUMENT) (Postman collection)

## Phase 0 checklist (BD + engineering)

1. Email `evat.support@gra.gov.gh` / local TSC to request **integrator / ERP-POS onboarding**.
2. Obtain: Postman/OpenAPI docs, **sandbox VSDC**, API security key process, OTP/serial flow.
3. Assign a **pilot VAT-registered taxpayer** willing to joint UAT.
4. Complete GRA readiness checklist (Appendix 4 in their docs) before UAT.
5. Do **not** market “GRA certified” until joint UAT acceptance is signed.

## Legal / consent framing (product)

- The **business remains the taxpayer** of record. ABS is certified software that calls GRA’s VSDC.
- Before enabling live e-VAT, a workspace admin must accept in-app consent acknowledging:
  - TIN / Ghana Card PIN and invoice data are sent to GRA for stamping
  - API credentials are stored encrypted for their tenant only
  - Offline queues will sync stamped invoices when connectivity returns
- Partner/agency APIs expose filing or stamp **summaries only for opted-in tenants**.

## ABS implementation map

| Area | Location |
|------|----------|
| Tax + levies config | `Backend/utils/taxConfig.js`, Settings → Organization |
| Stamp service | `Backend/services/evatService.js` |
| Compliance UI | `/compliance/*` (Statements, VAT, e-VAT, Filing) |
| Partner API | `/api/partner/v1` |
| Feature flag | `graEvat` in `Backend/config/features.js` |

## Sandbox vs live

- `tax.eVat.mode = sandbox` — stamp adapter returns simulated IRN/QR (local UAT of ABS flows).
- `tax.eVat.mode = live` — calls GRA VSDC base URL with tenant API key (requires Phase 0 access).

Rotate credentials from Compliance → e-VAT or Settings → Tax & Compliance.
