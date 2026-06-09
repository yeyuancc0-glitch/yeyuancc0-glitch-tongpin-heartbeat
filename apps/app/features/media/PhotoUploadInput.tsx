import type { CSSProperties } from "react";
import { Platform } from "react-native";

import { styles } from "@/features/home/homeStyles";

export function PhotoUploadInput({
  accessibilityLabel,
  disabled,
  multiple,
  onFiles,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  multiple?: boolean;
  onFiles: (files: FileList) => void;
}) {
  if (Platform.OS !== "web") {
    return null;
  }

  return (
    <input
      aria-label={accessibilityLabel}
      accept="image/jpeg,image/png,image/webp,image/gif"
      disabled={disabled}
      multiple={multiple}
      onChange={(event) => {
        const files = event.currentTarget.files;
        if (files?.length) {
          onFiles(files);
        }
        event.currentTarget.value = "";
      }}
      style={styles.photoNativeFileInput as CSSProperties}
      type="file"
    />
  );
}
