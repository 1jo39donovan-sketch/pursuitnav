// Favourites on Session: the places the crew starred in Search (a station, a
// custody suite, a hospital), one tap from a route, and theirs to rename,
// reorder or remove. Kept on the phone.
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { moved, renamed, setFavourites, toggled, useFavourites, type Favourite } from "../search/favourites";
import { colors, fonts } from "../theme";
import { useTextStyles } from "../textSize";
import { Button } from "./Button";

/** To Search, routing to the place at once. */
function routeTo(f: Favourite) {
  router.navigate({
    pathname: "/search",
    params: { lat: String(f.lat), lng: String(f.lng), title: f.name, q: "", from: `favourite-${Date.now()}` },
  });
}

export function FavouritesSection() {
  const styles = useTextStyles(baseStyles);
  const favourites = useFavourites();
  const [editing, setEditing] = useState<{ index: number; name: string } | null>(null);

  if (favourites.length === 0) {
    return (
      <Text style={styles.meta}>
        None yet. Star a place in Search (☆ on the place or its route) and it shows here and at the top of Search.
      </Text>
    );
  }
  return (
    <View style={styles.list}>
      {favourites.map((f, i) =>
        editing?.index === i ? (
          <View key={`${f.lat},${f.lng}`} style={styles.row}>
            <TextInput
              value={editing.name}
              onChangeText={(name) => setEditing({ index: i, name })}
              autoFocus
              style={styles.input}
              accessibilityLabel="Name for this favourite"
              onSubmitEditing={() => {
                setFavourites(renamed(favourites, i, editing.name));
                setEditing(null);
              }}
            />
            <Button
              label="Save"
              variant="primary"
              onPress={() => {
                setFavourites(renamed(favourites, i, editing.name));
                setEditing(null);
              }}
            />
          </View>
        ) : (
          <View key={`${f.lat},${f.lng}`} style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Route to ${f.name}`}
              onPress={() => routeTo(f)}
              style={({ pressed }) => [styles.place, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.name} numberOfLines={1}>
                ★ {f.name}
              </Text>
              {f.borough && <Text style={styles.meta}>{f.borough}</Text>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Move ${f.name} up`}
              disabled={i === 0}
              onPress={() => setFavourites(moved(favourites, i, -1))}
              hitSlop={6}
              style={[styles.small, i === 0 && styles.off]}
            >
              <Text style={styles.smallText}>↑</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Rename ${f.name}`}
              onPress={() => setEditing({ index: i, name: f.name })}
              hitSlop={6}
              style={styles.small}
            >
              <Text style={styles.smallText}>✎</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${f.name} from favourites`}
              onPress={() => setFavourites(toggled(favourites, f))}
              hitSlop={6}
              style={styles.small}
            >
              <Text style={[styles.smallText, styles.remove]}>✕</Text>
            </Pressable>
          </View>
        ),
      )}
      <Text style={styles.meta}>Tap a place to route there.</Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  list: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  place: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
  },
  name: { color: colors.fg, fontFamily: fonts.displaySemiBold, fontSize: 17 },
  meta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  // Big enough to hit with gloves on (30 Oct browser test).
  small: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
  },
  off: { opacity: 0.35 },
  smallText: { color: colors.fg, fontSize: 22 },
  remove: { color: colors.warn },
  input: {
    flex: 1,
    minHeight: 48,
    backgroundColor: colors.panel,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.fg,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingHorizontal: 12,
  },
});
