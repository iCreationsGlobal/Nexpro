# ABS Marketing Website

Modern, conversion-optimized marketing website for ABS built with Next.js 14+ (App Router), TailwindCSS, and Framer Motion.

## Features

- 🎨 Modern, Shopify-inspired design
- 📱 Fully responsive (mobile-first)
- ⚡ Optimized for performance and SEO
- 🎭 Smooth animations with Framer Motion
- 🎯 Conversion-focused CTAs and sections

## Project Structure

```
marketing-site/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with Header/Footer
│   ├── page.tsx           # Home/Landing page
│   ├── pricing/
│   │   └── page.tsx       # Pricing page
│   └── contact/
│       └── page.tsx       # Contact page
├── components/
│   ├── ui/               # Reusable UI components (shadcn/ui style)
│   ├── sections/         # Page sections (Hero, Features, Pricing, etc.)
│   └── layout/           # Layout components (Header, Footer)
├── lib/                  # Utilities and constants
│   ├── constants.ts      # Plan data, features, testimonials
│   └── utils.ts          # Utility functions (cn helper)
└── public/              # Static assets
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env.local
```

3. Update `.env.local` with your configuration:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Backend API URL for pricing, auth config, and demo/contact forms.
NEXT_PUBLIC_API_URL=https://demo-api.africanbusinesssuite.com
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) to view the site.

### Build

Build for production:

```bash
npm run build
```

Start production server:

```bash
npm start
```

## Pages

- **Home** (`/`) - Landing page with Hero, Features, Pricing, Testimonials, and CTA sections
- **Pricing** (`/pricing`) - Dedicated pricing page
- **Contact** (`/contact`) - Contact form and information

## Integration

### Online Store (`/shop/:slug`)

This marketing app does **not** render merchant shops. `next.config.ts` redirects `/shop/*` and legacy `/template/*` to the Vite storefront (`NEXT_PUBLIC_ONLINE_STORE_URL`, defaulting to `https://store.absghana.com`). Do not set `NEXT_PUBLIC_ONLINE_STORE_URL` to the same value as `NEXT_PUBLIC_SITE_URL`.

### Signup Flow

"Start Free Trial" buttons redirect to the main app's onboarding page. Configure the redirect URL in `next.config.ts`:

```typescript
{
  source: '/signup',
  destination: process.env.NEXT_PUBLIC_APP_URL + '/onboarding',
  permanent: false,
}
```

### Contact Form

The contact form currently logs submissions to console. To integrate with your backend:

1. Add API endpoint URL to `.env.local`:
```env
NEXT_PUBLIC_CONTACT_API_URL=https://demo-api.africanbusinesssuite.com/api/contact
```

2. Update `app/contact/page.tsx` to submit to the API endpoint.

## Customization

### Colors & Branding

Update brand colors in `app/globals.css`:

```css
:root {
  --primary: #2563eb;  /* Brand primary color */
  /* ... other colors */
}
```

### Content

Update content in `lib/constants.ts`:
- Plans and pricing
- Features list
- Business types
- Testimonials
- Trust indicators

### Styling

The project uses TailwindCSS. Customize theme in `tailwind.config.js` (or use CSS variables in `globals.css`).

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Styling**: TailwindCSS
- **UI Components**: Custom components (shadcn/ui style)
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **Forms**: React Hook Form + Zod
- **Type Safety**: TypeScript

## License

Private - ABS Project
