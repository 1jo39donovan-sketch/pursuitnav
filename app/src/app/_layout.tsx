import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LocationProvider } from "../location/LocationProvider";
import { LogProvider } from "../log/LogProvider";
import { RecIndicator } from "../components/RecIndicator";
import { TermsGate } from "../components/TermsGate";
import { NavigationProvider } from "../navigation/NavigationProvider";
import { OfflineMapProvider } from "../offline/OfflineMapProvider";
import { SearchProvider } from "../search/SearchProvider";
import { SessionProvider, useSession } from "../session/SessionProvider";
import { TeamProvider } from "../team/TeamProvider";
import { startUsage } from "../usage/usage";
import { useColors } from "../textSize";

SplashScreen.preventAutoHideAsync();
// Every request to the server carries the install ID and app version (usage counts).
startUsage();

export default function RootLayout() {
  // Fonts are bundled with the app, so this works with no signal.
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const ready = loaded || error != null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <LogProvider>
          <SearchProvider>
            <OfflineMapProvider>
              <LocationProvider>
                <NavigationProvider>
                  <TeamProvider>
                    <AppStack />
                    <RecIndicator />
                    {/* Over everything until the terms are agreed to. */}
                    <TermsGate />
                  </TeamProvider>
                </NavigationProvider>
              </LocationProvider>
            </OfflineMapProvider>
          </SearchProvider>
        </LogProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/** The screens, in the dark or light colours. */
function AppStack() {
  const palette = useColors();
  const { dark } = useSession();
  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        {/* The search log, opened from Session. */}
        <Stack.Screen name="log" />
        <Stack.Screen name="area" />
        <Stack.Screen
          name="navigate"
          options={{
            gestureEnabled: false,
            animation: "slide_from_bottom",
          }}
        />
      </Stack>
    </>
  );
}
