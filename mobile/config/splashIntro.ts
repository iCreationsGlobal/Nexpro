/** Marketing intro slides shown once before login / workspace onboarding. */

export type SplashIntroSmallCardVariant =
  | 'unusual-activity'
  | 'adapts'
  | 'payment-success'
  | 'whatsapp-share'
  | 'new-order'
  | 'image'
  | 'placeholder';

export type SplashIntroSlide = {
  id: string;
  title: string;
  subtitle: string;
  /** Shown in the large-card placeholder until art is plugged in. */
  largeCardPlaceholder: string;
  /** Shown in the status-card placeholder / native chip label. */
  smallCardPlaceholder: string;
  /** How the overlapping small chip/card is rendered. */
  smallCardVariant?: SplashIntroSmallCardVariant;
  /** Main slanted hero card art — set when assets are ready. */
  largeCardImage?: number | null;
  /** Overlapping status image when smallCardVariant is `image`. */
  smallCardImage?: number | null;
  /** Degrees of rotation for the large card (negative = counter-clockwise). */
  largeCardTiltDeg?: number;
  /** Degrees of rotation for the small status card. */
  smallCardTiltDeg?: number;
};

/** Native overlapping status chips (reliable on device vs padded PNGs). */
export const NATIVE_CHIP_VARIANTS: SplashIntroSmallCardVariant[] = [
  'unusual-activity',
  'adapts',
  'payment-success',
  'whatsapp-share',
  'new-order',
];

/**
 * Five-screen ABS product intro.
 */
export const SPLASH_INTRO_SLIDES: SplashIntroSlide[] = [
  {
    id: 'every-business',
    title: 'Built for Every Business',
    subtitle:
      'For retail, pharmacies and services,\nrestaurants and rentals—get the tools\nto run your business and grow.',
    largeCardPlaceholder: 'Business types card',
    smallCardPlaceholder: 'ABS adapts to your business',
    smallCardVariant: 'adapts',
    largeCardImage: require('@/assets/intro/every-business-large.png'),
    smallCardImage: null,
    largeCardTiltDeg: -5,
    smallCardTiltDeg: 0,
  },
  {
    id: 'smart-pos',
    title: 'Sell Faster with POS',
    subtitle:
      'Process sales in just a few taps,\naccept multiple payment methods\nand issue receipts in seconds.',
    largeCardPlaceholder: 'POS sale card',
    smallCardPlaceholder: 'Payment successful',
    smallCardVariant: 'payment-success',
    largeCardImage: require('@/assets/intro/smart-pos-large.png'),
    smallCardImage: null,
    largeCardTiltDeg: 5,
    smallCardTiltDeg: -2,
  },
  {
    id: 'quotations',
    title: 'Automatic Invoicing',
    subtitle:
      'ABS creates professional invoices\nand automatically sends them\nto customers via WhatsApp.',
    largeCardPlaceholder: 'Quotation card',
    smallCardPlaceholder: 'Invoice sent via WhatsApp',
    smallCardVariant: 'whatsapp-share',
    largeCardImage: require('@/assets/intro/quotations-large.png'),
    smallCardImage: null,
    largeCardTiltDeg: -5,
    smallCardTiltDeg: 4,
  },
  {
    id: 'online-store',
    title: 'Take Your Business Online',
    subtitle:
      'Create your own online store,\nshowcase your products and receive\norders from more customers.',
    largeCardPlaceholder: 'Online store card',
    smallCardPlaceholder: 'New online order',
    smallCardVariant: 'new-order',
    largeCardImage: require('@/assets/intro/online-store-large.png'),
    smallCardImage: null,
    largeCardTiltDeg: -6,
    smallCardTiltDeg: 3,
  },
  {
    id: 'abs-watch',
    title: 'Keep Your Shop in Sight',
    subtitle:
      'Connect CCTV to flag unusual activity,\nthen compare customer visits\nwith recorded sales and payments.',
    largeCardPlaceholder: 'ABS Watch card',
    smallCardPlaceholder: 'Unusual activity detected',
    /** Native chip — padded PNG was nearly invisible on device. */
    smallCardVariant: 'unusual-activity',
    largeCardImage: require('@/assets/intro/watch-large.png'),
    smallCardImage: null,
    largeCardTiltDeg: -6,
    smallCardTiltDeg: 3,
  },
];
