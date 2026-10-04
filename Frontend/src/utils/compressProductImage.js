import imageCompression from 'browser-image-compression';

/** Reject originals larger than this before compression (browser may still OOM on huge decode). */
export const PRODUCT_IMAGE_MAX_INPUT_BYTES = 40 * 1024 * 1024;

/** Files at or below this size are uploaded as-is to save CPU. */
export const PRODUCT_IMAGE_SKIP_COMPRESS_MAX_BYTES = 400 * 1024;

/** Practical upload size after compression (matches the previous compressor target). */
const TARGET_MAX_BYTES = 1.2 * 1024 * 1024;

const MAX_DIMENSION = 2048;

/** Stop a stuck compressor worker from leaving the product form spinning forever. */
const COMPRESSION_TIMEOUT_MS = 20000;

const WEB_SAFE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i;

/**
 * File input accept list. Includes iPhone HEIC/HEIF so the picker can select them.
 * The input is cleared after read; the product form is also noValidate so a leftover
 * file cannot block Update with a hidden browser validation error.
 */
export const PRODUCT_IMAGE_ACCEPT =
  'image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.webp';

/**
 * @param {File|Blob|null|undefined} file
 * @returns {boolean}
 */
export function isHeicLikeFile(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type.includes('heic') || type.includes('heif')) return true;
  return /\.hei[cf]$/i.test(String(file?.name || ''));
}

/**
 * Photos the product form can prepare. iPhone files often have an empty MIME type
 * and only a .heic/.heif name, which the old `image/` check rejected with no message.
 * @param {File|null|undefined} file
 * @returns {boolean}
 */
export function isProductImageFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  return IMAGE_EXTENSION.test(String(file.name || ''));
}

/**
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
 * @template T
 */
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * @param {File} file
 * @returns {string}
 */
function baseName(file) {
  return String(file?.name || 'product').replace(/\.[^.]+$/, '') || 'product';
}

/**
 * @param {CanvasImageSource & { width?: number, height?: number, naturalWidth?: number, naturalHeight?: number }} source
 * @param {number} maxDimension
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
function renderJpegBlob(source, maxDimension, quality) {
  const width0 = source.width || source.naturalWidth || 0;
  const height0 = source.height || source.naturalHeight || 0;
  if (!width0 || !height0) {
    return Promise.reject(new Error('Could not read this photo.'));
  }
  const scale = Math.min(1, maxDimension / Math.max(width0, height0));
  const width = Math.max(1, Math.round(width0 * scale));
  const height = Math.max(1, Math.round(height0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Could not process this photo.'));
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not convert this photo to JPEG.'))),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Decode a photo (including iPhone HEIC/HEIF where the browser can) and write a JPEG.
 * Safari and iOS can decode HEIC. Other browsers get a clear error instead of a hung upload.
 * @param {File} file
 * @returns {Promise<File>}
 */
async function convertToJpegFile(file) {
  let source = null;
  let closeSource = () => {};
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        source = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        source = await createImageBitmap(file);
      }
      closeSource = () => source?.close?.();
    }
  } catch {
    source = null;
  }

  if (!source) {
    source = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(
          'Could not read this iPhone photo. Try again in Safari, or export it as a JPG and upload that.'
        ));
      };
      img.src = url;
    });
  }

  try {
    let quality = 0.82;
    let maxDimension = MAX_DIMENSION;
    let blob = await renderJpegBlob(source, maxDimension, quality);
    for (let attempt = 0; attempt < 4 && blob.size > TARGET_MAX_BYTES; attempt += 1) {
      if (quality > 0.55) quality = Math.round((quality - 0.12) * 100) / 100;
      else maxDimension = Math.round(maxDimension * 0.75);
      blob = await renderJpegBlob(source, maxDimension, quality);
    }
    return new File([blob], `${baseName(file)}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    closeSource();
  }
}

/**
 * @param {File} file
 * @param {{ onProgress?: (percent: number) => void }} [options]
 * @returns {Promise<File>}
 */
async function compressWithLibrary(file, options) {
  const blob = await withTimeout(
    imageCompression(file, {
      maxSizeMB: 1.2,
      maxWidthOrHeight: MAX_DIMENSION,
      useWebWorker: true,
      onProgress: (progress) => {
        const n = Number(progress);
        if (!Number.isFinite(n)) return;
        const pct = n >= 0 && n <= 1 ? Math.round(n * 100) : Math.min(100, Math.round(n));
        options.onProgress?.(pct);
      },
    }),
    COMPRESSION_TIMEOUT_MS,
    'Image compression took too long. Please try a smaller photo.'
  );
  const type = blob.type && WEB_SAFE_MIME.has(blob.type) ? blob.type : 'image/jpeg';
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'jpg';
  return new File([blob], `${baseName(file)}.${ext}`, { type, lastModified: Date.now() });
}

/**
 * Compress a product image in the browser before upload, and turn iPhone HEIC/HEIF into JPEG.
 * Small web-safe files are returned unchanged.
 * @param {File} file
 * @param {{ onProgress?: (percent: number) => void }} [options] - onProgress: 0–100 while compressing (skipped for small files; see PRODUCT_IMAGE_SKIP_COMPRESS_MAX_BYTES)
 * @returns {Promise<File>}
 */
export async function compressProductImageFile(file, options = {}) {
  const { onProgress } = options;
  if (!file || !(file instanceof File)) {
    throw new Error('Invalid file');
  }
  if (!isProductImageFile(file)) {
    throw new Error('Please choose an image file');
  }
  if (file.size > PRODUCT_IMAGE_MAX_INPUT_BYTES) {
    throw new Error(
      `Image is too large (max ${PRODUCT_IMAGE_MAX_INPUT_BYTES / 1024 / 1024}MB). Try a smaller photo.`
    );
  }

  const labeledJpeg = String(file.type || '').toLowerCase() === 'image/jpg'
    ? new File([file], file.name || 'product.jpg', { type: 'image/jpeg', lastModified: file.lastModified })
    : file;

  let working = labeledJpeg;
  const mustConvert = isHeicLikeFile(labeledJpeg) || !WEB_SAFE_MIME.has(String(labeledJpeg.type || '').toLowerCase());
  if (mustConvert) {
    onProgress?.(10);
    working = await withTimeout(
      convertToJpegFile(labeledJpeg),
      COMPRESSION_TIMEOUT_MS,
      'Could not convert this photo. Try a JPG, or a smaller image.'
    );
    onProgress?.(100);
    if (working.size <= TARGET_MAX_BYTES) return working;
  }

  if (working.size <= PRODUCT_IMAGE_SKIP_COMPRESS_MAX_BYTES) {
    return working;
  }

  try {
    return await compressWithLibrary(working, { onProgress });
  } catch (libraryError) {
    try {
      onProgress?.(10);
      const fallback = await withTimeout(
        convertToJpegFile(working),
        COMPRESSION_TIMEOUT_MS,
        'Could not process this photo. Try a smaller JPG.'
      );
      onProgress?.(100);
      return fallback;
    } catch {
      throw libraryError;
    }
  }
}
