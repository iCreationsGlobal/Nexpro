const plugin = require("tailwindcss/plugin");

/**
 * Layout media queries. Keep in sync with src/hooks/useDeviceMode.js (a unit test checks).
 * APP_SHELL_MEDIA: bottom tabs + app headers (under 1024px, or a touch-first tablet up to 1366px).
 * DESKTOP_SHELL_MEDIA: the exact complement, where the sidebar layout is used.
 */
const PHONE_MEDIA = "(max-width: 767.98px)";
const APP_SHELL_MEDIA = "(max-width: 1023.98px), (pointer: coarse) and (max-width: 1366px)";
const DESKTOP_SHELL_MEDIA =
  "(min-width: 1024px) and (pointer: fine), (min-width: 1024px) and (pointer: none), (min-width: 1366.02px)";

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './app/**/*.{js,jsx}',
    './src/**/*.{js,jsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /** Workspace primary from BrandingContext (--color-primary / --color-primary-dark) */
        brand: {
          DEFAULT: "var(--color-primary)",
          dark: "var(--color-primary-dark)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "bounce-dot": {
          "0%, 80%, 100%": { transform: "scale(0.6)", opacity: "0.5" },
          "40%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "bounce-dot": "bounce-dot 1.4s ease-in-out infinite both",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    // `shell:` = app-style layout (phones and tablets), `desk:` = sidebar layout.
    plugin(({ addVariant }) => {
      addVariant("shell", `@media ${APP_SHELL_MEDIA}`);
      addVariant("desk", `@media ${DESKTOP_SHELL_MEDIA}`);
    }),
  ],
}

module.exports.layoutMedia = { PHONE_MEDIA, APP_SHELL_MEDIA, DESKTOP_SHELL_MEDIA };
