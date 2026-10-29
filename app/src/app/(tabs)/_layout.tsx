import { Tabs } from "expo-router";

import { Header } from "../../components/Header";
import { TabBar } from "../../components/TabBar";
import { useColors } from "../../textSize";

export default function TabLayout() {
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
