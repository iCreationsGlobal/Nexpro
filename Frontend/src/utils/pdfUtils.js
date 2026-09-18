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

/** Data-URI images larger than this are downscaled before html2canvas capture (see rasterizeOversizedImages). */
const OVERSIZED_IMAGE_SRC_LENGTH = 150000;

/**
 * html2canvas is far less robust than a normal browser <img> render — a multi-megabyte data-URI
 * logo (common when an image carries embedded metadata, e.g. C2PA content credentials) can
 * silently fail to draw, leaving a blank spot in the exported PDF even though it displays fine
 * on screen. Downscale any oversized image within `element` to its actual on-screen size right
 * before capture, then restore the original `src` afterward so the live page is unaffected.
 * @param {HTMLElement} element
 * @returns {() => void} restore function — always call this in a finally block
 */
const rasterizeOversizedImages = (element) => {
  const images = Array.from(element.querySelectorAll('img')).filter((img) => {
    const src = img.getAttribute('src') || '';
    return src.startsWith('data:') && src.length > OVERSIZED_IMAGE_SRC_LENGTH;
  });
  if (images.length === 0) return () => {};

  const restores = [];
  for (const img of images) {
    const originalSrc = img.getAttribute('src');
    try {
      const rect = img.getBoundingClientRect();
      const scale = 2; // keep it crisp without re-embedding the full original resolution
      const width = Math.max(1, Math.round((rect.width || img.naturalWidth || 140) * scale));
      const height = Math.max(1, Math.round((rect.height || img.naturalHeight || 72) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      img.setAttribute('src', canvas.toDataURL('image/png'));
      restores.push(() => img.setAttribute('src', originalSrc));
    } catch (err) {
      // Same-origin data: URIs never taint the canvas, but never let a logo issue block export.
      console.warn('[pdfUtils] Could not downscale oversized image for PDF export:', err?.message || err);
    }
  }
  return () => restores.forEach((restore) => restore());
};

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

  const restoreImages = rasterizeOversizedImages(element);

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
    restoreImages();
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

  const restoreImages = rasterizeOversizedImages(element);
  let pdf;
  try {
    pdf = await html2pdf().set(opt).from(element).outputPdf('blob');
  } catch (error) {
    rethrowPdfError(error);
  } finally {
    restoreImages();
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

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    printWindow.focus();
    printWindow.print();
    printWindow.onafterprint = () => printWindow.close();
  };

  // A logo embedded as a large data-URI can still be mid-decode when the popup first paints
  // (fresh document, no cache warm-up) — wait for every image to settle before printing,
  // otherwise the logo is silently skipped from the printed/PDF output.
  const images = Array.from(printWindow.document.images || []);
  const pending = images.filter((img) => !img.complete);
  if (pending.length === 0) {
    triggerPrint();
  } else {
    let remaining = pending.length;
    const onImageSettled = () => {
      remaining -= 1;
      if (remaining <= 0) triggerPrint();
    };
    pending.forEach((img) => {
      img.addEventListener('load', onImageSettled, { once: true });
      img.addEventListener('error', onImageSettled, { once: true });
    });
    setTimeout(triggerPrint, 1500);
  }
};

export default {
  generatePDF,
  generatePDFFromSelector,
  printPDF,
  openPrintDialog,
};
