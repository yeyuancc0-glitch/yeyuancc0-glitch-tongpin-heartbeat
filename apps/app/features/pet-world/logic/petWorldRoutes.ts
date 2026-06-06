export type PetWorldSurface =
  | "home"
  | "share"
  | "memory"
  | "creation_hub"
  | "pet_room"
  | "footprints"
  | "playground";

export const petWorldAllowedSurfaces = [
  "home",
  "share",
  "memory",
  "creation_hub",
  "pet_room",
  "footprints",
  "playground",
] as const satisfies readonly PetWorldSurface[];

export const defaultPetWorldSurface: PetWorldSurface = "home";

const petWorldAllowedSurfaceSet = new Set<string>(petWorldAllowedSurfaces);

export type PetWorldRouteState = {
  surface: PetWorldSurface;
  disabled: boolean;
  reason?: string;
};

export function isPetWorldSurface(surface: string | null | undefined): surface is PetWorldSurface {
  return typeof surface === "string" && petWorldAllowedSurfaceSet.has(surface);
}

export function isPetWorldAllowed(surface: string | null | undefined): surface is PetWorldSurface {
  return isPetWorldSurface(surface);
}

export function petWorldSurfaceForAppState(input: {
  activeTab: "home" | "checkins" | "calendar" | "me";
  subPage: string;
  townView?: "hub" | "pet" | "footprints" | "playground";
  blockingModalOpen?: boolean;
  inputFocused?: boolean;
}) {
  if (input.blockingModalOpen || input.inputFocused) {
    return { surface: "pet_room" as const, disabled: true, reason: "blocked_surface" };
  }

  if (input.subPage === "creation") {
    if (input.townView === "footprints") {
      return { surface: "footprints" as const, disabled: false };
    }
    if (input.townView === "playground") {
      return { surface: "playground" as const, disabled: false };
    }
    if (input.townView === "pet") {
      return { surface: "pet_room" as const, disabled: false };
    }
    return { surface: "creation_hub" as const, disabled: false };
  }

  if (input.subPage === "messages") {
    return { surface: "home" as const, disabled: false, reason: "messages_surface" };
  }

  if (input.subPage !== "main") {
    return { surface: "pet_room" as const, disabled: true, reason: "detail_surface" };
  }

  if (input.activeTab === "checkins") {
    return { surface: "share" as const, disabled: false };
  }
  if (input.activeTab === "calendar") {
    return { surface: "memory" as const, disabled: false };
  }
  if (input.activeTab === "home") {
    return { surface: "home" as const, disabled: false };
  }
  if (input.activeTab === "me") {
    return { surface: "pet_room" as const, disabled: true, reason: "personal_surface" };
  }
  return { surface: "pet_room" as const, disabled: true, reason: "personal_surface" };
}
