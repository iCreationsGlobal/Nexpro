import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';

import { useCart } from '@/context/CartContext';
import { productService } from '@/services/productService';
import { createScanQueue, type ScanQueue } from '@/utils/scanQueue';
import {
  SCAN_MESSAGES,
  formatAddedLine,
  lookUpScannedCode,
  planScanAdd,
  summarizeCart,
  type BarcodeLookup,
  type ScanAddStep,
  type SellScanProduct,
} from '@/utils/sellScan';
import type { ProductVariantStockInput } from '@/utils/productStock';

const NOTICE_MS = 2500;

const defaultLookup: BarcodeLookup = (candidates) => productService.getProductByBarcodeCandidates(candidates);

/**
 * Keep-scanning selling session (Sell tab and Simple Mode Sell). Each accepted scan is looked
 * up and added to the cart in scan order; problems show briefly on the camera screen; a product
 * that needs a size or colour opens the picker and the queue waits until it is closed.
 */
export function useSellScanSession({
  loadedProducts,
  lookup = defaultLookup,
}: {
  /** Products already on screen, matched by barcode before asking the server. */
  loadedProducts: SellScanProduct[];
  lookup?: BarcodeLookup;
}) {
  const { items, addItem } = useCart();
  const [visible, setVisible] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pickerProduct, setPickerProduct] = useState<SellScanProduct | null>(null);
  const [finishing, setFinishing] = useState(false);

  const activeRef = useRef(false);
  const mountedRef = useRef(true);
  const loadedRef = useRef(loadedProducts);
  loadedRef.current = loadedProducts;
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  const addItemRef = useRef(addItem);
  addItemRef.current = addItem;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Adds this opening; the cart state may not have re-rendered yet when Continue runs.
  const addedCountRef = useRef(0);
  const pickerDoneRef = useRef<(() => void) | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((message: string) => {
    if (!mountedRef.current || !activeRef.current) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null;
      if (mountedRef.current) setNotice(null);
    }, NOTICE_MS);
  }, []);

  const applyStep = useCallback(
    (step: ScanAddStep) => {
      if (step.kind === 'problem') {
        showNotice(step.message);
        return;
      }
      if (step.kind !== 'add') return;
      if (addItemRef.current(step.input)) {
        addedCountRef.current += 1;
        if (mountedRef.current) setLastAdded(formatAddedLine(step.label, step.unitPrice));
      } else {
        showNotice(SCAN_MESSAGES.outOfStock(step.label));
      }
    },
    [showNotice]
  );

  const handleCode = useCallback(
    async (code: string) => {
      const result = await lookUpScannedCode(code, {
        loadedProducts: loadedRef.current,
        lookup: lookupRef.current,
      });
      if (result.status !== 'found') {
        showNotice(result.message);
        return;
      }
      const step = planScanAdd(result.product);
      if (step.kind !== 'choose-variant') {
        applyStep(step);
        return;
      }
      // The camera was closed while this was being looked up: nowhere to choose a size.
      if (!activeRef.current || !mountedRef.current) return;
      await new Promise<void>((resolve) => {
        pickerDoneRef.current = resolve;
        setPickerProduct(step.product);
      });
    },
    [applyStep, showNotice]
  );

  const handleCodeRef = useRef(handleCode);
  handleCodeRef.current = handleCode;
  const queueRef = useRef<ScanQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = createScanQueue(
      (code) => handleCodeRef.current(code),
      () => showNotice(SCAN_MESSAGES.somethingWrong)
    );
  }
  const queue = queueRef.current;

  const releasePicker = useCallback(() => {
    if (mountedRef.current) setPickerProduct(null);
    const done = pickerDoneRef.current;
    pickerDoneRef.current = null;
    done?.();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRef.current = false;
      queue.clear();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      const done = pickerDoneRef.current;
      pickerDoneRef.current = null;
      done?.();
    };
  }, [queue]);

  const open = useCallback(() => {
    activeRef.current = true;
    addedCountRef.current = 0;
    setLastAdded(null);
    setNotice(null);
    setFinishing(false);
    setVisible(true);
  }, []);

  /** X: shut the camera now; what is already in the cart stays there. */
  const close = useCallback(() => {
    activeRef.current = false;
    queue.clear();
    releasePicker();
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
    setNotice(null);
    setFinishing(false);
    setVisible(false);
  }, [queue, releasePicker]);

  /** Continue: let the scans already taken finish, then shut the camera and go on. */
  const finish = useCallback(
    async (next: (result: { cartHasItems: boolean }) => void) => {
      setFinishing(true);
      await queue.whenIdle();
      if (!mountedRef.current || !activeRef.current) return;
      close();
      next({ cartHasItems: itemsRef.current.length > 0 || addedCountRef.current > 0 });
    },
    [close, queue]
  );

  const onScan = useCallback((code: string) => queue.push(code), [queue]);

  const chooseVariant = useCallback(
    (variant: ProductVariantStockInput) => {
      if (pickerProduct) applyStep(planScanAdd(pickerProduct, variant));
      releasePicker();
    },
    [applyStep, pickerProduct, releasePicker]
  );

  const summary = useMemo(() => summarizeCart(items), [items]);

  return {
    visible,
    open,
    close,
    finish,
    finishing,
    onScan,
    /** Codes are not counted while a size is being chosen or the session is finishing. */
    paused: !!pickerProduct || finishing,
    lastAdded,
    notice,
    summary,
    pickerProduct,
    chooseVariant,
    cancelPicker: releasePicker,
  };
}

export type SellScanSession = ReturnType<typeof useSellScanSession>;
