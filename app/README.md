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

## Checks

```bash
npm run typecheck
npm run lint
```

## Layout

- `src/app/` — screens (Expo Router). `(tabs)/` holds Session, Search, Pursuit, Log.
- `src/location/LocationProvider.tsx` — the app's single GPS subscription.
- `src/components/LiveMap.tsx` — dark map that follows the phone's position.
- `src/config.ts` — region settings (London for v1) and the map style URL.
- `src/theme.ts` — colours and fonts from the prototype.
