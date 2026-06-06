export const motionTokens = {
  pressScale: 0.95,
  iconPressScale: 0.86,
  iconPopScale: 1.15,
  quickFlightDurationMs: 880,
  modalEnterMs: 320,
  fadeMs: 180,
  shakeMs: 280,
  photoDismissDistance: 130,
  photoDismissVelocity: 820,
  spring: {
    gentle: {
      damping: 17,
      stiffness: 210,
      mass: 0.9,
    },
    press: {
      damping: 14,
      stiffness: 360,
      mass: 0.65,
    },
    tab: {
      damping: 19,
      stiffness: 260,
      mass: 0.8,
    },
    sheet: {
      damping: 20,
      stiffness: 230,
      mass: 0.9,
    },
  },
} as const;
