import { StyleSheet, View } from "react-native";

import { GpsStatus } from "../../components/GpsStatus";
import { LiveMap } from "../../components/LiveMap";

// Map first; the address box and the two routes go on top of it in steps 2–3.
export default function SearchScreen() {
  return (
    <View style={styles.screen}>
      <GpsStatus />
      <LiveMap />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
