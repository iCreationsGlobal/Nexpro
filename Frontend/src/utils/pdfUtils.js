import {
  CHUNK_LOAD_REFRESH_MESSAGE,
  hasChunkLoadError,
  loadHtml2Pdf,
} from './chunkLoadError';

/**
 * Wrap PDF errors so chunk-load failures surface a refresh hint.
 * @param {unknown} error
 * @throws {Error}
 */
const rethrowPdfError = (error) => {
  if (hasChunkLoadError(error)) {
    const err = new Error(CHUNK_LOAD_REFRESH_MESSAGE);
    err.cause = error;
    throw err;
  }
  throw error;
};

const MM_PER_PX = 25.4 / 96;

/**
 * Generate a PDF from an HTML element
 * @param {HTMLElement} element - The HTML element to convert to PDF
 * @param {Object} options - PDF generation options
 * @param {string} options.filename - The filename for the PDF (default: 'document.pdf')
 * @param {string} options.format - Page format (default: 'a4'). Ignored when contentWidthMm is set.
 * @param {string} options.orientation - Page orientation: 'portrait' or 'landscape' (default: 'portrait')
 * @param {number} options.scale - Scale factor for rendering (default: 2)
 * @param {boolean} options.download - Whether to download immediately (default: true)
 * @param {number} [options.contentWidthMm] - Render at this width instead of the default A4 190mm
 *   (e.g. 52/72 for 58mm/80mm thermal receipt rolls). Pairs with dynamicHeight for continuous-roll paper.
 * @param {boolean} [options.dynamicHeight] - Size the PDF page to the element's actual rendered
 *   height instead of a fixed A4 page height, for thermal receipt rolls with no fixed page length.
 * @returns {Promise} - Promise that resolves when PDF is generated
 */
export const generatePDF = async (element, options = {}) => {
  const {
    filename = 'document.pdf',
    format = 'a4',
    orientation = 'portrait',
    scale = 2,
    download = true,
    margin = [10, 10, 10, 10],
    contentWidthMm = null,
    dynamicHeight = false,
  } = options;

  const html2pdf = await loadHtml2Pdf();

  // Store original styles
  const originalWidth = element.style.width;
  const originalMaxWidth = element.style.maxWidth;
  const originalPadding = element.style.padding;

  // Default: A4 width minus margins = ~190mm. contentWidthMm overrides this for thermal receipt widths.
  const widthMm = contentWidthMm || 190;
  element.style.width = `${widthMm}mm`;
  element.style.maxWidth = `${widthMm}mm`;
  element.style.padding = contentWidthMm ? '0' : '10mm';

  let jsPdfFormat = format;
  let windowWidth = 794; // A4 width in pixels at 96dpi

  if (dynamicHeight) {
    // Force a reflow at the new width before measuring — height depends on width (text rewraps narrower).
    void element.offsetHeight;
    const heightMm = Math.max(element.scrollHeight * MM_PER_PX, 40);
    jsPdfFormat = [widthMm, heightMm];
    windowWidth = Math.round(widthMm / MM_PER_PX);
  }

  const opt = {
    margin,
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale,
      useCORS: true,
      logging: false,
      letterRendering: true,
      windowWidth,
    },
    jsPDF: {
      unit: 'mm',
      format: jsPdfFormat,
      orientation,
      compress: true,
    },
    pagebreak: {
      mode: 'avoid-all',
    },
  };

  try {
    if (download) {
      await html2pdf().set(opt).from(element).save();
    } else {
      return await html2pdf().set(opt).from(element).outputPdf('blob');
    }
  } catch (error) {
    rethrowPdfError(error);
  } finally {
    // Restore original styles
    element.style.width = originalWidth;
    element.style.maxWidth = originalMaxWidth;
    element.style.padding = originalPadding;
  }
};

/**
 * Generate PDF from a specific element by selector
 * @param {string} selector - CSS selector for the element
 * @param {Object} options - PDF generation options
 */
export const generatePDFFromSelector = async (selector, options = {}) => {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  return generatePDF(element, options);
};

/**
 * Open PDF in a new window for printing
 * @param {HTMLElement} element - The HTML element to convert to PDF
 * @param {Object} options - PDF generation options
 */
export const printPDF = async (element, options = {}) => {
  const html2pdf = await loadHtml2Pdf();

  const opt = {
    margin: [10, 10, 10, 10],
    filename: options.filename || 'document.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: options.scale || 2,
      useCORS: true,
      logging: false,
    },
    jsPDF: {
      unit: 'mm',
      format: options.format || 'a4',
      orientation: options.orientation || 'portrait',
    },
  };

  let pdf;
  try {
    pdf = await html2pdf().set(opt).from(element).outputPdf('blob');
  } catch (error) {
    rethrowPdfError(error);
  }

  const pdfUrl = URL.createObjectURL(pdf);

  // Open in new window and trigger print
  const printWindow = window.open(pdfUrl);
  if (printWindow) {
    printWindow.onload = () => {
      printWindow.print();
    };
  }

  return pdf;
};

/**
 * Open native print dialog with the given element's content (no PDF download)
 * @param {HTMLElement} element - Element containing printable content (with styles if needed)
 * @param {string} [title='Print'] - Document title for the print window
 */
export const openPrintDialog = (element, title = 'Print') => {
  if (!element) return;
  const content = element.innerHTML;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 8px; font-family: Arial, sans-serif; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>${content}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.onafterprint = () => printWindow.close();
};

export default {
  generatePDF,
  generatePDFFromSelector,
  printPDF,
  openPrintDialog,
};
