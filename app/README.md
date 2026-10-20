# Blue Route app

React Native (Expo SDK 57, TypeScript, Expo Router) with MapLibre for the map.

## Running it

MapLibre has native code, so this needs an Expo **development build**. Expo Go won't work.

```bash
cd app
npm install
npx expo run:android      # or: npx expo run:ios  (needs Android Studio / Xcode)
# or build in the cloud and install on your phone:
npx eas-cli@latest build --profile development --platform android
npm start                 # then open the dev build on the phone
```

## Routing server

Routes come from the Blue Route server (`../server`). The app reads its address from `EXPO_PUBLIC_API_URL` when it's bundled; nothing is checked in. Point it at your server when starting:

```bash
EXPO_PUBLIC_API_URL=https://your-server.example npm start
```

GitHub builds set it from the repository's `SERVER_DOMAIN` variable (as `https://<SERVER_DOMAIN>`): `android.yml` exports it, `store.yml` writes it into the production profile just before the EAS build, and `web.yml` passes it to the web export. For an EAS build from your own machine, add `EXPO_PUBLIC_API_URL` as an EAS environment variable first (Expo dashboard → your project → Environment variables, or `npx eas-cli env:create`).

Without it the app runs, but the Search tab says routing isn't set up. For now, press and hold on the map to set a destination; address search replaces that in build step 3.

## Demo build

`npm run build:demo` makes a single self-contained web page with a scripted drive instead of GPS and bundled borough outlines instead of map tiles, for showing the app from a link.

## Checks

```bash
npm run typecheck
npm run lint
```

## Layout

- `src/app/` — screens (Expo Router). `(tabs)/` holds Session, Search, Pursuit, Log.
- `src/location/LocationProvider.tsx` — the app's single GPS subscription.
- `src/components/LiveMap.tsx` — dark map that follows the phone's position.
- `src/config.ts` — region settings (London for v1), map style URL and routing server URL.
- `src/api/routes.ts` — client for the server's routes API.
- `src/components/RoutePanel.tsx` — the standard and police routes side by side.
- `src/theme.ts` — colours and fonts from the prototype.
