# Bulk product labels (ABS web)

Open **Products → Generate labels**. Search and select catalog products; use **Choose variants** for variant products. Selections remain across pages. Set copies per item, then continue.

Choose barcode + price, QR + price, price only, barcode only, or QR only. The initial printer profile is a 50 × 30 mm thermal label roll. Set custom dimensions, columns, gaps, sheet margins, alignment offsets and used-sticker positions. A4 and Letter sheets are supported. Saved printer settings are local to the browser and tenant/shop.

Code designs require saved barcodes. **Generate and save missing codes** writes internal CODE128-compatible numbers using the existing product/variant update APIs. Existing codes are preserved; update permission errors stop preparation. If a batch partly fails, successfully saved codes remain. QR payloads use barcode lookup so POS can resolve the exact variant and current price. No price or cost is encoded in QR content.

Preview labels, print one test sticker, then print the batch. Choose **Save as PDF** in the browser print dialog for a PDF export. Select matching paper dimensions in the installed printer driver, 100%/actual size, and disable headers/footers. The browser does not directly control USB/Bluetooth printers or detect their media.

Limits: 1–500 copies per item, 2,000 stickers per batch; configurable dimensions 25–210 mm wide and 20–297 mm high. Long names are shortened visually. Code density is checked against available width; test prints and physical scanner validation remain necessary, especially on small media. Price currency defaults to the existing ABS cedi display and is editable in the profile.

Validation: seven focused automated tests cover dimensions, pagination, skipped positions, invalid quantities, safe text rendering, zero prices, selection across pages, and price-only preparation without catalog writes. Frontend production build also checked. Physical printer alignment has not been tested in this environment.
