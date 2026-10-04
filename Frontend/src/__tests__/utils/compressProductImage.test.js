import { beforeEach, describe, expect, it, vi } from 'vitest';
import imageCompression from 'browser-image-compression';
import {
  compressProductImageFile,
  isHeicLikeFile,
  isProductImageFile,
  PRODUCT_IMAGE_MAX_INPUT_BYTES,
} from '../../utils/compressProductImage';

vi.mock('browser-image-compression', () => ({
  default: vi.fn(),
}));

/**
 * @param {string} name
 * @param {string} type
 * @param {number} size
 * @returns {File}
 */
function imageFile(name, type, size) {
  const file = new File([new Uint8Array(Math.min(size, 64))], name, { type });
  if (file.size !== size) {
    Object.defineProperty(file, 'size', { value: size });
  }
  return file;
}

describe('compressProductImageFile', () => {
  beforeEach(() => {
    imageCompression.mockReset();
    globalThis.createImageBitmap = vi.fn(async () => ({
      width: 4032,
      height: 3024,
      close() {},
    }));
    HTMLCanvasElement.prototype.getContext = () => ({
      drawImage() {},
    });
    HTMLCanvasElement.prototype.toBlob = (callback, type) => {
      callback(new Blob([new Uint8Array(120)], { type: type || 'image/jpeg' }));
    };
  });

  it('recognizes iPhone HEIC files even when the browser leaves the MIME type empty', () => {
    const file = imageFile('IMG_2201.HEIC', '', 2_000_000);
    expect(isProductImageFile(file)).toBe(true);
    expect(isHeicLikeFile(file)).toBe(true);
    expect(isProductImageFile(imageFile('notes.txt', '', 20))).toBe(false);
    expect(isHeicLikeFile(imageFile('photo.heif', 'application/octet-stream', 100))).toBe(true);
  });

  it('converts HEIC to a JPEG and does not upload the original', async () => {
    const file = imageFile('IMG_2201.HEIC', 'image/heic', 3_000_000);
    const prepared = await compressProductImageFile(file);
    expect(prepared).not.toBe(file);
    expect(prepared.type).toBe('image/jpeg');
    expect(prepared.name).toBe('IMG_2201.jpg');
    expect(prepared.size).toBeLessThan(file.size);
    expect(imageCompression).not.toHaveBeenCalled();
  });

  it('returns a small web-safe photo unchanged', async () => {
    const file = imageFile('shelf.jpg', 'image/jpeg', 20_000);
    await expect(compressProductImageFile(file)).resolves.toBe(file);
    expect(imageCompression).not.toHaveBeenCalled();
  });

  it('compresses a large JPEG and falls back to canvas if the compressor fails', async () => {
    const file = imageFile('shelf.jpg', 'image/jpeg', 900_000);
    imageCompression.mockResolvedValueOnce(new Blob([new Uint8Array(80)], { type: 'image/jpeg' }));
    const compressed = await compressProductImageFile(file);
    expect(imageCompression).toHaveBeenCalledTimes(1);
    expect(compressed.type).toBe('image/jpeg');
    expect(compressed.size).toBe(80);

    imageCompression.mockRejectedValueOnce(new Error('worker hung'));
    const fallback = await compressProductImageFile(file);
    expect(fallback.type).toBe('image/jpeg');
    expect(fallback.name).toBe('shelf.jpg');
  });

  it('rejects a non-image and an oversized photo with a message', async () => {
    await expect(compressProductImageFile(imageFile('notes.txt', 'text/plain', 40))).rejects.toThrow(/image/i);
    await expect(
      compressProductImageFile(imageFile('huge.jpg', 'image/jpeg', PRODUCT_IMAGE_MAX_INPUT_BYTES + 1))
    ).rejects.toThrow(/too large/i);
    expect(imageCompression).not.toHaveBeenCalled();
  });
});
