// Hands an exported file to the phone's share sheet (Mail, Files, AirDrop,
// WhatsApp…). Nothing is sent anywhere unless the officer picks somewhere.
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function shareFile(name: string, text: string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}
