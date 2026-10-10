# Mobile App Build Guide — Zero-Error Setup

Step-by-step guide to build the Expo mobile app with all dependencies, imports, and configuration correct from the start.

---

## Prerequisites

- **Node.js** 18+ (match `Frontend/.nvmrc` if present)
- **npm** or **yarn**
- **Expo Go** app on your phone (iOS App Store / Google Play)
- **Backend** running (default: `http://localhost:5001` or `5000`)

---

## Step 1: Create the Expo App

From the project root:

```bash
cd /Users/us/Desktop/Development/Nexpro
npx create-expo-app@latest mobile --template tabs
```

If the template flag isn't available, run `npx create-expo-app@latest mobile` and choose **tabs** when prompted. The tabs template includes Expo Router + TypeScript.

This creates `mobile/` with:
- `app/_layout.tsx` — root layout
- `app/(tabs)/_layout.tsx` — tab layout
- `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx` — default tabs

---

## Step 2: Install All Dependencies

```bash
cd mobile
```

### Core (Auth, API, Storage)

```bash
npx expo install expo-secure-store
npx expo install expo-constants
npx expo install axios
```

### Navigation (usually included; verify)

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-status-bar
```

### UI & UX

```bash
npx expo install expo-blur
npx expo install expo-image
npx expo install @expo/vector-icons
```

### Forms & Data

```bash
npm install @tanstack/react-query
```

### Optional (add when needed)

```bash
# QR/Camera — may require dev build
npx expo install expo-camera

# Bottom sheets
npm install @gorhom/bottom-sheet react-native-reanimated

# FlashList for performant lists
npm install @shopify/flash-list

# Offline detection
npx expo install @react-native-community/netinfo
```

---

## Step 3: Configure Environment & API URL

Create `mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:5001
```

**For physical device on same WiFi:** Use your machine's LAN IP **and the Backend listen port**:

```bash
cd mobile && npm run show-api-url
```

Copy the output to `mobile/.env`. The script probes `GET /health` so it picks up Backend port bumps (e.g. configured `5001` but listening on `5002`). Restart Expo after changing `.env` (`npx expo start --clear`).

Or get your IP: `ipconfig getifaddr en0` (Mac) — still verify the Backend port from the server log.

**Important:** Expo only exposes env vars prefixed with `EXPO_PUBLIC_`. Access via `process.env.EXPO_PUBLIC_API_URL`.

---

## Step 4: Path Aliases (Clean Imports)

Create or update `mobile/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

Then in `babel.config.js` (or create it):

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': './',
          },
        },
      ],
    ],
  };
};
```

Install the plugin:

```bash
npm install babel-plugin-module-resolver --save-dev
```

Now you can use: `import { api } from '@/services/api'`

---

## Step 5: App Config (app.json / app.config.js)

Ensure `mobile/app.json` has:

```json
{
  "expo": {
    "name": "ABS",
    "slug": "abs",
    "scheme": "abs",
    "extra": {
      "apiUrl": "http://localhost:5001"
    }
  }
}
```

For dynamic env, use `app.config.js`:

```javascript
export default {
  expo: {
    name: 'ABS',
    slug: 'abs',
    scheme: 'abs',
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001',
    },
  },
};
```

### Production / EAS

This app is linked to EAS project ID `8dff9445-6979-427f-b84e-aae48f077d82` with bundle/package ID `com.absghana.app`.

For production builds, set:

```env
EXPO_PUBLIC_API_URL=https://api.africanbusinesssuite.com
```

Then run from `mobile/`:

```bash
npm run build:ios
npm run build:android
```

### EAS Upload Size and EPIPE Troubleshooting

Run EAS builds from `mobile/`, not the repository root:

```bash
cd /Users/us/Desktop/Development/Nexpro/mobile
npm run build:ios
```

EAS archives the Git repository root even when run from `mobile/`. The repository-root `.easignore` therefore includes only `mobile/` and excludes dependencies, generated output, native build folders, all `.env*` files, and local credentials. `mobile/.easignore` provides equivalent exclusions if the app is copied into its own repository. Keep the repository-root allowlist intact; unrelated repository assets previously inflated the upload to 946 MB.

If upload fails with `write EPIPE`, the connection to EAS/Google Cloud Storage was interrupted while streaming the archive. Retry on a stable WiFi connection, disable VPN/proxy if possible, and keep the archive small by checking that `.easignore` is present before rebuilding.

You need active Apple Developer and Google Play accounts before submitting builds to the stores.

---

## Step 6: Backend CORS for Mobile

Add your dev machine's LAN IP and Expo URLs to `Backend/.env`:

```
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://192.168.1.100:3000,exp://192.168.1.100:8081
```

Expo Go uses `exp://` scheme. Adjust IP and port as needed.

---

## Step 7: Verify Imports & Run

### Check Root Layout

`app/_layout.tsx` should wrap with providers. Minimal working version:

```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
```

### Check Tab Layout

`app/(tabs)/_layout.tsx` — ensure all tab files exist. Rename `explore.tsx` to match your tabs (e.g. `sales.tsx`, `customers.tsx`).

### Run

```bash
npx expo start
```

Scan QR with Expo Go. If you get "Unable to resolve module" or "Network request failed":

1. **Module errors:** Run `npx expo start --clear` to clear cache
2. **Network errors:** Ensure `EXPO_PUBLIC_API_URL` uses LAN IP when on device; Backend CORS includes your origin

---

## Common Errors & Fixes

| Error | Fix |
|-------|-----|
| `Unable to resolve module` | Run `npx expo start --clear`; check path aliases in `tsconfig` + `babel-plugin-module-resolver` |
| `Network request failed` | Use LAN IP for API URL; add CORS origin in Backend |
| `expo-camera` not working in Expo Go | Use Development Build: `eas build --profile development` |
| `Invariant Violation: Native module cannot be null` | Some native modules need dev build; stick to Expo Go–compatible packages |
| `Metro bundler` port conflict | Run `npx expo start --port 8082` |
| TypeScript errors on `process.env` | Add `expo-env.d.ts` with `declare namespace NodeJS { interface ProcessEnv { EXPO_PUBLIC_API_URL?: string } }` |

---

## Dependency Checklist

Before first run, ensure these are installed:

- [ ] `expo` (from create-expo-app)
- [ ] `expo-router`
- [ ] `expo-secure-store`
- [ ] `expo-constants`
- [ ] `axios`
- [ ] `react-native-safe-area-context`
- [ ] `react-native-screens`
- [ ] `expo-linking`
- [ ] `expo-status-bar`
- [ ] `@expo/vector-icons`
- [ ] `babel-plugin-module-resolver` (dev)

---

## Quick Start (Copy-Paste)

```bash
cd /Users/us/Desktop/Development/Nexpro
npx create-expo-app@latest mobile --template tabs
cd mobile
npx expo install expo-secure-store expo-constants expo-blur expo-image expo-router react-native-safe-area-context react-native-screens expo-linking expo-status-bar
npm install axios @tanstack/react-query
npm install babel-plugin-module-resolver --save-dev
echo "EXPO_PUBLIC_API_URL=http://localhost:5001" > .env
npx expo start
```

---

## Troubleshooting: "Connection refused" / "Network Error" / Store timeout

If the app shows **Connection refused**, **Network Error**, or Store tab **Request timed out** / "Still working…":

1. **Start the backend** and note the **actual listen port** in the Backend log:
   ```bash
   cd Backend
   npm run dev
   ```
   If `PORT` (e.g. 5001) is busy, Backend auto-bumps (`Port 5001 in use, trying 5002...`). Mobile must use that bumped port — not the configured `PORT` alone.

2. **Same WiFi + fresh LAN IP**: For a physical device, `EXPO_PUBLIC_API_URL` must be your computer’s current LAN IP and the listen port. Get both with:
   ```bash
   cd mobile && npm run show-api-url
   ```
   Copy the printed line into `mobile/.env`, then restart Expo with cache clear (`npx expo start --clear`). LAN IPs change across networks; a stale IP hangs until axios’s 30s timeout.

3. **Port match**: Prefer matching `Backend/.env` `PORT` and free that port. If something else owns it (e.g. another Python app on `:5001`), either stop that process or point mobile at the port Backend actually logged.

4. **Empty Online Store settings** are not a timeout: `GET /api/store/setup-status` should return quickly with `checklist.hasSettings: false` and the Store tab shows the welcome screen. Timeouts mean the phone never reached ABS.
