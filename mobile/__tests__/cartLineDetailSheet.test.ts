import React from 'react';
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Alert: { alert: jest.fn() },
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/components/AppIcon', () => ({ AppIcon: 'AppIcon' }));
jest.mock('@/components/AppBottomSheet', () => {
  const ReactLib = jest.requireActual('react');
  return {
    AppBottomSheet: ({ visible, title, children, footer }: { visible: boolean; title: string; children: unknown; footer: unknown }) =>
      visible ? ReactLib.createElement('Sheet', { title }, children, footer) : null,
  };
});
jest.mock('@/hooks/useScreenColors', () => ({
  useScreenColors: () => ({
    colors: { tint: '#166534' },
    cardBg: '#fff',
    borderColor: '#e5e7eb',
    textColor: '#111',
    mutedColor: '#6b7280',
    inputBg: '#f3f4f6',
    onTint: '#fff',
  }),
}));
jest.mock('@/utils/fileUtils', () => ({ resolveImageUrl: (url: string) => url }));
jest.mock('@/services/productService', () => ({
  productService: { getProductById: jest.fn(), getProductVariants: jest.fn() },
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ activeTenantId: 't1' }) }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartProvider, useCart, type CartItem } from '@/context/CartContext';
import { CartLineDetailSheet } from '@/components/CartLineDetailSheet';
import { productService } from '@/services/productService';
import { buildCartLineDetails } from '@/utils/cartLineDetails';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const consoleError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('react-test-renderer is deprecated')) return;
    consoleError(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

const gownLine: CartItem = {
  id: 'line-1',
  productId: 'p-gown',
  productVariantId: 'v-m',
  name: 'Gown - M',
  unitPrice: 120,
  quantity: 1,
  discount: 0,
  imageUrl: 'gown.jpg',
  sku: 'GOWN-M',
  barcode: '222222',
  trackStock: true,
  quantityOnHand: 3,
};

const gownProduct = {
  id: 'p-gown',
  name: 'Gown',
  barcode: '111111',
  sku: 'GOWN',
  description: 'Long evening gown',
  imageUrl: 'gown.jpg',
  unit: 'pcs',
  brand: 'Ama Designs',
  category: { id: 'c1', name: 'Dresses' },
  trackStock: true,
  quantityOnHand: 9,
  hasVariants: true,
  metadata: { storeImages: { B: 'gown-back.jpg', C: '' } },
  variants: [
    { id: 'v-s', name: 'S', barcode: '000001', sku: 'GOWN-S', quantityOnHand: 6, attributes: { size: 'S' } },
    { id: 'v-m', name: 'M', barcode: '222222', sku: 'GOWN-M', quantityOnHand: 3, attributes: { size: 'M', color: 'Red' } },
  ],
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('');

async function renderSheet() {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ items: [gownLine], savedAt: Date.now() }));
  let resolveProduct: (value: unknown) => void = () => {};
  let rejectProduct: (error: unknown) => void = () => {};
  (productService.getProductById as jest.Mock).mockReturnValue(new Promise((resolve, reject) => {
    resolveProduct = resolve;
    rejectProduct = reject;
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const cart: { current: ReturnType<typeof useCart> | null } = { current: null };
  const onClose = jest.fn();
  function Probe() {
    cart.current = useCart();
    return null;
  }
  const tree = (itemId: string | null) =>
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(
        CartProvider,
        null,
        React.createElement(Probe),
        React.createElement(CartLineDetailSheet, { itemId, onClose })
      )
    );
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(tree(null));
    await wait(5);
  });
  // The seller taps the line.
  await act(async () => {
    renderer.update(tree('line-1'));
    await wait(5);
  });
  const root = () => renderer.root;
  return {
    cart: () => cart.current!,
    onClose,
    texts: () => root().findAllByType('Text' as never).map(textOf),
    images: () => root().findAllByType('Image' as never).map((node) => node.props.source.uri),
    button: (label: string) => root().find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function'),
    press: async (label: string) => {
      const target = root().find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
      await act(async () => { target.props.onPress(); await wait(1); });
    },
    loadProduct: async () => {
      await act(async () => {
        resolveProduct({ success: true, data: gownProduct });
        await wait(5);
      });
    },
    failProduct: async () => {
      await act(async () => {
        rejectProduct(new Error('Network Error'));
        await wait(5);
      });
    },
    unmount: () => act(() => { renderer.unmount(); client.clear(); }),
  };
}

describe('cart line pop-up', () => {
  it("opens with the line's details while the product loads, then shows the product's full details", async () => {
    const sheet = await renderSheet();
    let texts = sheet.texts();
    expect(texts).toEqual(expect.arrayContaining(['Gown - M', '₵ 120.00 each', '1', '₵ 120.00', '222222', 'GOWN-M']));
    expect(texts).toContain('Loading product details…');
    expect(productService.getProductById).toHaveBeenCalledWith('p-gown');

    await sheet.loadProduct();
    texts = sheet.texts();
    expect(texts).toEqual(expect.arrayContaining([
      'Gown', 'M', 'Colour: Red', '₵ 120.00 each',
      'Barcode', '222222', 'SKU', 'GOWN-M',
      'Category', 'Dresses', 'Brand', 'Ama Designs', 'Unit', 'pcs', 'In stock', '3',
      'Long evening gown',
    ]));
    expect(texts).not.toContain('Loading product details…');
    // The size's own barcode, not the product's main one.
    expect(texts).not.toContain('111111');
    expect(sheet.images()).toEqual(['gown.jpg', 'gown-back.jpg']);
    sheet.unmount();
  });

  it('offline, shows what the cart line has', async () => {
    const sheet = await renderSheet();
    await sheet.failProduct();
    const texts = sheet.texts();
    expect(texts).toEqual(expect.arrayContaining(['Gown - M', '₵ 120.00 each', '222222', 'GOWN-M', '3']));
    expect(texts).toContain('Showing what the cart has saved. More details need the internet.');
    expect(sheet.images()).toEqual(['gown.jpg']);
    await sheet.press('Increase quantity for Gown - M');
    expect(sheet.cart().items[0].quantity).toBe(2);
    sheet.unmount();
  });

  it('− / + change the quantity in the cart, up to the stock', async () => {
    const sheet = await renderSheet();
    await sheet.loadProduct();
    await sheet.press('Increase quantity for Gown');
    expect(sheet.cart().items[0].quantity).toBe(2);
    expect(sheet.texts()).toEqual(expect.arrayContaining(['2', '₵ 240.00']));

    await sheet.press('Increase quantity for Gown');
    expect(sheet.cart().items[0].quantity).toBe(3);
    // Only 3 in stock: + is off.
    expect(sheet.button('Increase quantity for Gown').props.disabled).toBe(true);
    expect(sheet.texts()).toContain('Only 3 in stock');

    await sheet.press('Decrease quantity for Gown');
    expect(sheet.cart().items[0].quantity).toBe(2);
    sheet.unmount();
  });

  it('asks before removing, then takes the line out and closes', async () => {
    const sheet = await renderSheet();
    const alert = Alert.alert as jest.Mock;
    alert.mockClear();
    await sheet.press('Remove from cart');
    expect(alert).toHaveBeenCalledWith('Remove from cart?', expect.any(String), expect.any(Array));
    expect(sheet.cart().items).toHaveLength(1);

    const buttons = alert.mock.calls[0][2] as Array<{ text: string; style?: string; onPress?: () => void }>;
    await act(async () => { buttons.find((b) => b.style === 'destructive')?.onPress?.(); await wait(1); });
    expect(sheet.cart().items).toHaveLength(0);
    expect(sheet.onClose).toHaveBeenCalled();
    sheet.unmount();
  });

  it('− on the last one asks to remove instead of silently dropping it', async () => {
    const sheet = await renderSheet();
    const alert = Alert.alert as jest.Mock;
    alert.mockClear();
    await sheet.press('Decrease quantity for Gown - M');
    expect(alert).toHaveBeenCalledTimes(1);
    expect(sheet.cart().items[0].quantity).toBe(1);
    sheet.unmount();
  });
});

describe('buildCartLineDetails', () => {
  it('leaves out what is empty and shows only the line when offline', () => {
    const details = buildCartLineDetails({ ...gownLine, productVariantId: null, name: 'Soap', sku: '', barcode: '' });
    expect(details.name).toBe('Soap');
    expect(details.variantName).toBeNull();
    expect(details.facts).toEqual([{ label: 'In stock', value: '3' }]);
    expect(details.photos).toEqual(['gown.jpg']);
    expect(details.description).toBeNull();
    expect(details.maxQuantity).toBe(3);
  });

  it('has no stock limit for made-to-order products', () => {
    const details = buildCartLineDetails({ ...gownLine, productVariantId: null, trackStock: false });
    expect(details.maxQuantity).toBeNull();
    expect(details.facts).toContainEqual({ label: 'In stock', value: 'Made to order' });
  });
});
