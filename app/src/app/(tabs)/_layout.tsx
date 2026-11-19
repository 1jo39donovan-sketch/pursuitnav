import { Tabs, usePathname } from "expo-router";

import { noteFirstScreen } from "../../navigation/launch";

import { Header } from "../../components/Header";
import { TabBar } from "../../components/TabBar";
import { useColors } from "../../textSize";

export default function TabLayout() {
  // Which tab this launch opened on (Session's jump to Search depends on it).
  noteFirstScreen(usePathname());
  const palette = useColors();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        header: () => <Header />,
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Session" }} />
      <Tabs.Screen name="search" options={{ title: "Search" }} />
      <Tabs.Screen name="pursuit" options={{ title: "Pursuit" }} />
    </Tabs>
  );
}
