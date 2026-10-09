import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { formatDistance } from "../format";
import type { SearchResult, SearchResults } from "../search/engine";
import { colors, fonts } from "../theme";

interface Props {
  results: SearchResults;
  showOutside: boolean;
  onToggleOutside: () => void;
  onPick: (result: SearchResult) => void;
  footer?: React.ReactElement | null;
  emptyText: string;
  /** Current position, to show how far away each match is. */
  from?: { lat: number; lng: number } | null;
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(toRad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

const TAGS: Partial<Record<SearchResult["kind"], { text: string; color: string }>> = {
  road: { text: "ROAD", color: colors.muted },
  postcode: { text: "POSTCODE", color: colors.blue },
  estate: { text: "ESTATE", color: colors.amber },
  saved: { text: "SAVED", color: colors.amber },
  address: { text: "ADDRESS", color: colors.ok },
};

/** Matches in the officer's boroughs, with others behind "Show N outside your area". */
export function SearchResultsList({ results, showOutside, onToggleOutside, onPick, footer, emptyText, from }: Props) {
  const rows = showOutside ? [...results.inArea, ...results.outside.slice(0, 30)] : results.inArea;
  const outsideCount = results.outsideCount ?? results.outside.length;
  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Row
          result={item}
          outside={!results.inArea.includes(item)}
          onPick={onPick}
          away={from ? formatDistance(distanceM(from, item)) : undefined}
        />
      )}
      ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
      ListFooterComponent={
        <View>
          {outsideCount > 0 && (
            <Pressable accessibilityRole="button" onPress={onToggleOutside} style={styles.toggle}>
              <Text style={styles.toggleText}>
                {showOutside
                  ? "Hide matches outside your area"
                  : `Show ${outsideCount} match${outsideCount === 1 ? "" : "es"} outside your area`}
              </Text>
            </Pressable>
          )}
          {footer}
        </View>
      }
    />
  );
}

function Row({
  result,
  outside,
  onPick,
  away,
}: {
  result: SearchResult;
  outside: boolean;
  onPick: (r: SearchResult) => void;
  away?: string;
}) {
  const tag = outside
    ? { text: "OUT OF AREA", color: colors.muted }
    : result.placeType
      ? { text: result.placeType.toUpperCase(), color: colors.blue }
      : TAGS[result.kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPick(result)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.panel }]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.label, outside && { color: colors.muted }]}>{result.label}</Text>
        <Text style={styles.detail}>{result.detail}</Text>
      </View>
      <View style={styles.side}>
        {tag && <Text style={[styles.tag, { color: tag.color, borderColor: tag.color }]}>{tag.text}</Text>}
        {away && <Text style={styles.away}>{away}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, minWidth: 0 },
  label: { color: colors.fg, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  detail: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  side: { alignItems: "flex-end", gap: 4, maxWidth: "45%" },
  away: { color: colors.muted, fontFamily: fonts.mono, fontSize: 12 },
  tag: { fontFamily: fonts.mono, fontSize: 10, borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, paddingVertical: 16 },
  toggle: { paddingVertical: 14 },
  toggleText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 15 },
});
