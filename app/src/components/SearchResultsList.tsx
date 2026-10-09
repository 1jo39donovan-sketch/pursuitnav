import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import type { SearchResult, SearchResults } from "../search/engine";
import { colors, fonts } from "../theme";

interface Props {
  results: SearchResults;
  showOutside: boolean;
  onToggleOutside: () => void;
  onPick: (result: SearchResult) => void;
  footer?: React.ReactElement | null;
  emptyText: string;
}

const TAGS: Partial<Record<SearchResult["kind"], { text: string; color: string }>> = {
  postcode: { text: "POSTCODE", color: colors.blue },
  estate: { text: "ESTATE", color: colors.amber },
  saved: { text: "SAVED", color: colors.amber },
  address: { text: "ADDRESS", color: colors.ok },
};

/** Matches in the officer's boroughs, with others behind "Show N outside your area". */
export function SearchResultsList({ results, showOutside, onToggleOutside, onPick, footer, emptyText }: Props) {
  const rows = showOutside ? [...results.inArea, ...results.outside.slice(0, 30)] : results.inArea;
  const outsideCount = results.outside.length;
  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <Row result={item} outside={!results.inArea.includes(item)} onPick={onPick} />}
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

function Row({ result, outside, onPick }: { result: SearchResult; outside: boolean; onPick: (r: SearchResult) => void }) {
  const tag = outside ? { text: "OUT OF AREA", color: colors.muted } : TAGS[result.kind];
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
      {tag && <Text style={[styles.tag, { color: tag.color, borderColor: tag.color }]}>{tag.text}</Text>}
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
  tag: { fontFamily: fonts.mono, fontSize: 10, borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  empty: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, paddingVertical: 16 },
  toggle: { paddingVertical: 14 },
  toggleText: { color: colors.blue, fontFamily: fonts.bodyMedium, fontSize: 15 },
});
