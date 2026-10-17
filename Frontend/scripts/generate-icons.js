/**
 * Generate PWA icons with ABS branding
 * Run with: node scripts/generate-icons.js            (everything)
 *           node scripts/generate-icons.js maskable apple splash   (only some outputs)
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const MASKABLE_SIZES = [192, 512];
const OUTPUT_DIR = path.join(__dirname, '../public/icons');
const SPLASH_DIR = path.join(__dirname, '../public/splash');

const SOURCE_LOGO = path.join(__dirname, '../public/abs-logo-icon.png');

/** Same diagonal green as the logo's own background, used to fill edge-to-edge icons. */
const BACKGROUND_SVG = (size) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1d6439"/>
        <stop offset="0.45" stop-color="#00402a"/>
        <stop offset="1" stop-color="#00281e"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`
);

/** Splash screens: manifest background_color. */
const SPLASH_BACKGROUND = '#ffffff';

/**
 * iOS launch screens (apple-touch-startup-image), portrait CSS size × pixel ratio.
 * iPads also get landscape images because the installed app rotates on tablets.
 */
const SPLASH_DEVICES = [
  { name: 'iPhone 16 Pro Max', width: 440, height: 956, ratio: 3 },
  { name: 'iPhone 16 Pro', width: 402, height: 874, ratio: 3 },
  { name: 'iPhone 15/14 Pro Max, 15/14 Plus', width: 430, height: 932, ratio: 3 },
  { name: 'iPhone 15/14 Pro, 15, 16', width: 393, height: 852, ratio: 3 },
  { name: 'iPhone 13/12 Pro Max, 14 Plus', width: 428, height: 926, ratio: 3 },
  { name: 'iPhone 14/13/12', width: 390, height: 844, ratio: 3 },
  { name: 'iPhone 13/12 mini, 11 Pro, X/XS', width: 375, height: 812, ratio: 3 },
  { name: 'iPhone 11 Pro Max, XS Max', width: 414, height: 896, ratio: 3 },
  { name: 'iPhone 11, XR', width: 414, height: 896, ratio: 2 },
  { name: 'iPhone SE, 8', width: 375, height: 667, ratio: 2 },
  { name: 'iPad Pro 12.9"', width: 1024, height: 1366, ratio: 2, tablet: true },
  { name: 'iPad Pro 11"', width: 834, height: 1194, ratio: 2, tablet: true },
  { name: 'iPad Air', width: 820, height: 1180, ratio: 2, tablet: true },
  { name: 'iPad 10.2"', width: 810, height: 1080, ratio: 2, tablet: true },
  { name: 'iPad mini', width: 744, height: 1133, ratio: 2, tablet: true },
  { name: 'iPad 9.7"', width: 768, height: 1024, ratio: 2, tablet: true },
];

async function generateIcon(size) {
  const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);

  await sharp(SOURCE_LOGO)
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  console.log(`Generated: icon-${size}x${size}.png`);
}

/**
 * The logo mark (white A, green arrow and bars) without its rounded-square backdrop: pixels are
 * kept by brightness, since the backdrop is dark green and the mark is white / bright green.
 * @param {number} size
 */
async function logoMark(size) {
  const rgb = await sharp(SOURCE_LOGO)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .flatten({ background: '#000000' })
    .removeAlpha()
    .toBuffer();
  // Brightness 87 (backdrop's brightest green) → transparent, 128 and up → opaque; soft in between.
  const alpha = await sharp(rgb).greyscale().linear(6.3, -548).toBuffer();
  return sharp(rgb).joinChannel(alpha).png().toBuffer();
}

/**
 * Logo mark on an edge-to-edge background.
 * @param {number} size - Output size in px
 * @param {number} logoScale - Logo size relative to the canvas
 */
async function fullBleedIcon(size, logoScale) {
  const mark = await logoMark(Math.round(size * logoScale));
  return sharp(BACKGROUND_SVG(size))
    .composite([{ input: mark, gravity: 'center' }])
    .flatten({ background: '#00402a' })
    .png({ compressionLevel: 9 });
}

/** Android maskable icons: the logo stays inside the 80% safe-zone circle. */
async function generateMaskable(size) {
  const file = `maskable-${size}x${size}.png`;
  await (await fullBleedIcon(size, 0.84)).toFile(path.join(OUTPUT_DIR, file));
  console.log(`Generated: ${file}`);
}

/** iOS home-screen icon: no transparency (iOS fills it black) and iOS rounds the corners itself. */
async function generateAppleTouchIcon() {
  await (await fullBleedIcon(180, 0.92)).toFile(path.join(OUTPUT_DIR, 'apple-touch-icon.png'));
  console.log('Generated: apple-touch-icon.png');
}

const splashFile = (width, height) => `splash-${width}x${height}.png`;

async function generateSplash(widthPx, heightPx) {
  const logoSize = Math.round(Math.min(widthPx, heightPx) * 0.28);
  const logo = await sharp(SOURCE_LOGO).resize(logoSize, logoSize, { fit: 'contain' }).png().toBuffer();
  await sharp({
    create: { width: widthPx, height: heightPx, channels: 3, background: SPLASH_BACKGROUND },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(path.join(SPLASH_DIR, splashFile(widthPx, heightPx)));
}

/** Writes the images and prints the <link> tags for index.html. */
async function generateSplashScreens() {
  fs.mkdirSync(SPLASH_DIR, { recursive: true });
  const links = [];
  for (const device of SPLASH_DEVICES) {
    const orientations = device.tablet ? ['portrait', 'landscape'] : ['portrait'];
    for (const orientation of orientations) {
      const portrait = orientation === 'portrait';
      const widthPx = (portrait ? device.width : device.height) * device.ratio;
      const heightPx = (portrait ? device.height : device.width) * device.ratio;
      await generateSplash(widthPx, heightPx);
      links.push(
        `    <link rel="apple-touch-startup-image" href="/splash/${splashFile(widthPx, heightPx)}" ` +
          `media="(device-width: ${device.width}px) and (device-height: ${device.height}px) and ` +
          `(-webkit-device-pixel-ratio: ${device.ratio}) and (orientation: ${orientation})" />`
      );
    }
  }
  console.log(`Generated ${links.length} splash screens. Tags for index.html:\n${links.join('\n')}`);
}

async function main() {
  const only = new Set(process.argv.slice(2));
  const wants = (step) => only.size === 0 || only.has(step);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!fs.existsSync(SOURCE_LOGO)) {
    throw new Error(`Source logo not found: ${SOURCE_LOGO}`);
  }

  console.log('Generating ABS PWA icons...\n');

  if (wants('icons')) {
    for (const size of ICON_SIZES) {
      await generateIcon(size);
    }
  }
  if (wants('maskable')) {
    for (const size of MASKABLE_SIZES) {
      await generateMaskable(size);
    }
  }
  if (wants('apple')) await generateAppleTouchIcon();
  if (wants('splash')) await generateSplashScreens();

  console.log('\nAll icons generated successfully!');
}

main().catch(console.error);
