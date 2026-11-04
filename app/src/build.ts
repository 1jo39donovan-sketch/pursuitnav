// Which build this is. BUILD_ID is set by each workflow when it bundles the
// app's code (short commit and date), so Session can say exactly what's
// running. A store build (App Store, Google Play) takes its updates on the
// "store" channel; the channel is part of the native build, so it holds
// across over-the-air updates, unlike anything baked into the code.
import * as Updates from "expo-updates";
import { Platform } from "react-native";

export const BUILD_ID = process.env.EXPO_PUBLIC_BUILD_ID || "local build";

export const STORE_BUILD = Platform.OS !== "web" && Updates.channel === "store";
