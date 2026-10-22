import {
  BarlowCondensed_500Medium,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from "@expo-google-fonts/barlow-condensed";
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from "@expo-google-fonts/ibm-plex-sans";
import { useFonts } from "expo-font";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LocationProvider } from "../location/LocationProvider";
import { LogProvider } from "../log/LogProvider";
import { NavigationProvider } from "../navigation/NavigationProvider";
import { OfflineMapProvider } from "../offline/OfflineMapProvider";
import { SearchProvider } from "../search/SearchProvider";
import { SessionProvider } from "../session/SessionProvider";
import { TeamProvider } from "../team/TeamProvider";
import { colors } from "../theme";
import { startUsage } from "../usage/usage";

SplashScreen.preventAutoHideAsync();
// Every request to the server carries the install ID and app version (usage counts).
startUsage();

export default function RootLayout() {
  // Fonts are bundled with the app, so this works with no signal.
  const [loaded, error] = useFonts({
    BarlowCondensed_500Medium,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_500Medium,
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
                <TeamProvider>
                  <NavigationProvider>
                    <StatusBar style="light" />
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: colors.bg },
                      }}
                    >
                      <Stack.Screen name="(tabs)" />
                      {/* The search log, opened from Session. */}
                      <Stack.Screen name="log" />
                      <Stack.Screen
                        name="navigate"
                        options={{
                          gestureEnabled: false,
                          animation: "slide_from_bottom",
                        }}
                      />
                    </Stack>
                  </NavigationProvider>
                </TeamProvider>
              </LocationProvider>
            </OfflineMapProvider>
          </SearchProvider>
        </LogProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
