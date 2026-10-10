import { Asset } from "expo-asset";
import { File } from "expo-file-system";

/** Reads a bundled text asset, e.g. require("../../assets/data/roads.dat"). */
export async function loadText(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error(`Asset ${asset.name} has no local file`);
  return new File(asset.localUri).text();
}
