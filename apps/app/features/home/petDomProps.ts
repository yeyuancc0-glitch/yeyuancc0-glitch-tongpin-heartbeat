import { Platform } from "react-native";

export function petAnchorProps(name: string, role = name) {
  if (Platform.OS !== "web") {
    return {};
  }
  return { dataSet: { petAnchor: name, petAnchorRole: role } } as Record<string, unknown>;
}

export function petSafeContentProps() {
  if (Platform.OS !== "web") {
    return {};
  }
  return { dataSet: { petSafeZone: "content" } } as Record<string, unknown>;
}

export function petSafeActionProps() {
  if (Platform.OS !== "web") {
    return {};
  }
  return { dataSet: { petSafeZone: "action" } } as Record<string, unknown>;
}
