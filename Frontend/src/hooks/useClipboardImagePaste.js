import { useEffect, useRef } from 'react';

/**
 * Lets users paste copied photos or screenshots (Ctrl/Cmd+V) while `enabled` is true.
 * Only clipboard images are intercepted; pasting text into fields works as usual.
 *
 * @param {{ enabled: boolean, onImages: (files: File[]) => void }} options
 */
export default function useClipboardImagePaste({ enabled, onImages }) {
  const onImagesRef = useRef(onImages);

  useEffect(() => {
    onImagesRef.current = onImages;
  }, [onImages]);

  useEffect(() => {
    if (!enabled) return undefined;

    const handlePaste = (event) => {
      const stamp = Date.now();
      const files = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter(Boolean)
        // Screenshots all arrive as a generic "image.png"; give each a unique name for storage.
        .map((file, index) => new File(
          [file],
          `pasted-image-${stamp}-${index}.${file.type.split('/')[1] || 'png'}`,
          { type: file.type },
        ));
      if (!files.length) return;
      event.preventDefault();
      onImagesRef.current(files);
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [enabled]);
}
