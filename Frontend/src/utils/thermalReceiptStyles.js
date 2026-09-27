/** Shared, self-contained styles for invoice and end-of-sale thermal printing. */
export const getThermalReceiptStyles = (printStyles) => `
        .thermal-mode {
          background: #fff;
          color: #000;
        }
        .thermal-receipt {
          text-align: center;
          max-width: ${printStyles.contentWidth};
          margin: 0 auto;
          padding: ${printStyles.isThermal ? '2mm' : '0'};
          font-family: Helvetica, Arial, sans-serif;
          font-size: 10px;
          color: #000;
        }
        .thermal-logo {
          display: block;
          max-width: 120px;
          max-height: 50px;
          margin: 0 auto 6px;
          object-fit: contain;
        }
        .thermal-title {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 4px;
          letter-spacing: 1px;
        }
        .thermal-business {
          font-size: 9px;
          line-height: 1.4;
          margin-bottom: 6px;
          color: #000;
        }
        .thermal-separator {
          border: none;
          border-top: 1px dotted #000;
          margin: 6px 0;
        }
        .thermal-date-row {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          margin-bottom: 6px;
        }
        .thermal-items {
          text-align: left;
          margin: 8px 0;
          list-style: none;
          padding: 0;
        }
        .thermal-item-list {
          display: block;
          font-size: 9px;
          padding: 4px 0;
          border-bottom: none;
        }
        .thermal-item-name {
          display: block;
          margin-bottom: 4px;
          font-weight: 400;
          overflow-wrap: anywhere;
        }
        .thermal-item-detail {
          display: block;
          margin-bottom: 4px;
          overflow-wrap: anywhere;
        }
        .thermal-item-amount {
          display: block;
          font-weight: 400;
          text-align: left;
          padding-left: 8px;
        }
        .thermal-total-row {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          padding: 3px 0;
        }
        .thermal-total-row.bold {
          font-weight: bold;
          font-size: 11px;
          border-top: 1px dotted #000;
          padding-top: 6px;
          margin-top: 4px;
        }
        .thermal-thanks {
          font-size: 12px;
          font-weight: bold;
          margin-top: 10px;
          letter-spacing: 2px;
        }
`;
