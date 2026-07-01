import type { CSSProperties } from "react";
import { Platform } from "react-native";

import { styles } from "@/features/home/homeStyles";

export function PhotoUploadInput({
  accessibilityLabel,
  disabled,
  blocked,
  multiple,
  onFiles,
  onRequireAccess,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  blocked?: boolean;
  multiple?: boolean;
  onFiles: (files: FileList) => void;
  onRequireAccess?: () => void;
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
      onClick={(event) => {
        if (disabled) {
          return;
        }
        if (blocked) {
          event.preventDefault();
          event.stopPropagation();
          onRequireAccess?.();
        }
      }}
      onChange={(event) => {
        if (disabled || blocked) {
          event.currentTarget.value = "";
          return;
        }
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
