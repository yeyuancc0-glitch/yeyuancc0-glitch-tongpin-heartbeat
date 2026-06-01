import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, FormEvent, PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";

import { colors, shadows } from "@/styles/theme";

type ViewStyleProps = PropsWithChildren<Omit<ViewProps, "style"> & { style?: StyleProp<ViewStyle> }>;
type TextStyleProps = PropsWithChildren<Omit<TextProps, "style"> & { style?: StyleProp<TextStyle> }>;
type ToastTone = "success" | "error" | "info";

type ToastMessage = {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (toast: Omit<ToastMessage, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);
const ScrollContext = createContext(0);

let toastId = 0;

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    document.documentElement.style.backgroundColor = colors.bg;
    document.body.style.backgroundColor = colors.bg;
    document.body.style.minHeight = "100vh";
    document.body.style.margin = "0";
    document.body.style.backgroundImage =
      "linear-gradient(180deg, #fffaf7 0%, #fffdfb 48%, #fff7f5 100%)";
    document.body.style.backgroundAttachment = "fixed";
    document.getElementById("root")?.style.setProperty("background-color", colors.bg);
    document.getElementById("root")?.style.setProperty("min-height", "100vh");
  }, []);

  const showToast = useCallback((nextToast: Omit<ToastMessage, "id">) => {
    toastId += 1;
    setToast({ ...nextToast, id: toastId });
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setToast(null);
    }, toast.tone === "error" ? 4600 : 2600);

    return () => clearTimeout(timeout);
  }, [toast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View style={[styles.toast, styles[`toast_${toast.tone}`]]}>
          <Text style={styles.toastTitle}>{toast.title}</Text>
          {toast.message ? <Text style={styles.toastMessage}>{toast.message}</Text> : null}
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}

export function Screen({ children, style }: ViewStyleProps) {
  return <View style={[styles.screen, styles.webPageBackground, style]}>{children}</View>;
}

export function AppShell({ children }: PropsWithChildren) {
  return <View style={styles.shell}>{children}</View>;
}

export function AppScroll({ children }: PropsWithChildren) {
  const [scrollY, setScrollY] = useState(0);
  const lastScrollY = useRef(0);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(event) => {
        const nextScrollY = event.nativeEvent.contentOffset.y;
        if (Math.abs(nextScrollY - lastScrollY.current) < 8) {
          return;
        }
        lastScrollY.current = nextScrollY;
        setScrollY(nextScrollY);
      }}
    >
      <ScrollContext.Provider value={scrollY}>{children}</ScrollContext.Provider>
    </ScrollView>
  );
}

export function useAppScrollY() {
  return useContext(ScrollContext);
}

export function ResponsiveRow({ children, style }: ViewStyleProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 720;

  return <View style={[styles.responsiveRow, isCompact ? styles.responsiveColumn : null, style]}>{children}</View>;
}

export function Panel({ children, style }: ViewStyleProps) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function H1({ children, style }: TextStyleProps) {
  return <Text style={[styles.h1, style]}>{children}</Text>;
}

export function H2({ children, style }: TextStyleProps) {
  return <Text style={[styles.h2, style]}>{children}</Text>;
}

export function Body({ children, style }: TextStyleProps) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Label({ children, style }: TextStyleProps) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.faint} {...props} style={[styles.field, props.style]} />;
}

export function DateField({
  value,
  onChangeText,
  placeholder = "YYYY-MM-DD",
  style,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
}) {
  if (Platform.OS === "web") {
    const flattenedStyle = StyleSheet.flatten([styles.field, style]) as CSSProperties;
    const handleDateChange = (event: ChangeEvent<HTMLInputElement> | FormEvent<HTMLInputElement>) => {
      onChangeText(event.currentTarget.value);
    };

    return (
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        type="date"
        value={value}
        onInput={handleDateChange}
        onChange={handleDateChange}
        onBlur={handleDateChange}
        style={flattenedStyle}
      />
    );
  }

  return (
    <Field
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      inputMode="numeric"
      keyboardType="numbers-and-punctuation"
      style={style}
    />
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  icon,
  loading,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  icon?: ReactNode;
  loading?: boolean;
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && !isDisabled ? styles.buttonPressed : null,
        isDisabled ? styles.buttonDisabled : null,
      ]}
    >
      {loading ? <ActivityIndicator color={variant === "primary" ? "#fff" : colors.accentDark} size="small" /> : icon}
      <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{label}</Text>
    </Pressable>
  );
}

export function InlineLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.inlineLink}>
      <Text style={styles.inlineLinkText}>{label}</Text>
    </Pressable>
  );
}

export function LoadingState({ label = "加载中" }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      <Body>{label}</Body>
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>♡</Text>
      <H2>{title}</H2>
      <Body>{description}</Body>
    </View>
  );
}

export function InlineNotice({ children, tone = "info" }: PropsWithChildren<{ tone?: ToastTone }>) {
  return (
    <View style={[styles.notice, styles[`notice_${tone}`]]}>
      <Body style={styles.noticeText}>{children}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "transparent",
    minHeight: "100%",
  },
  webPageBackground:
    Platform.OS === "web"
      ? ({
          minHeight: "100vh",
          backgroundColor: "transparent",
        } as unknown as ViewStyle)
      : {},
  scroll: {
    flex: 1,
    backgroundColor: "transparent",
  },
  scrollContent: {
    backgroundColor: "transparent",
    flexGrow: 1,
  },
  shell: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 24,
    gap: 18,
  },
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 26,
    padding: 18,
    ...shadows.panel,
  },
  responsiveRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    alignItems: "flex-start",
  },
  responsiveColumn: {
    flexDirection: "column",
    flexWrap: "nowrap",
  },
  h1: {
    color: colors.ink,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: 0,
  },
  h2: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: 0,
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    letterSpacing: 0,
  },
  field: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.74)",
    paddingHorizontal: 14,
    color: colors.ink,
    fontSize: 15,
    minWidth: 0,
  },
  button: {
    minHeight: 46,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  button_primary: {
    backgroundColor: colors.accent,
  },
  button_secondary: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.border,
    borderWidth: 1,
  },
  button_danger: {
    backgroundColor: "#fff1f1",
    borderColor: "#f1c6c6",
    borderWidth: 1,
  },
  button_ghost: {
    backgroundColor: "transparent",
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ translateY: 1 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 18,
    letterSpacing: 0,
  },
  buttonText_primary: {
    color: "#fff",
  },
  buttonText_secondary: {
    color: colors.accentDark,
  },
  buttonText_danger: {
    color: "#aa3d43",
  },
  buttonText_ghost: {
    color: colors.accentDark,
  },
  inlineLink: {
    alignSelf: "flex-start",
  },
  inlineLinkText: {
    color: colors.accentDark,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  loading: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyIcon: {
    color: colors.accent,
    fontSize: 34,
    lineHeight: 40,
  },
  toast: {
    position: "absolute",
    top: 18,
    right: "4%",
    width: "92%",
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 20,
    ...shadows.panel,
  },
  toast_success: {
    backgroundColor: "#eef8f2",
    borderColor: "#b9ddc8",
  },
  toast_error: {
    backgroundColor: "#fff1f1",
    borderColor: "#f1c6c6",
  },
  toast_info: {
    backgroundColor: "#fffaf6",
    borderColor: colors.border,
  },
  toastTitle: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  toastMessage: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  notice: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  notice_success: {
    backgroundColor: "#eef8f2",
    borderColor: "#b9ddc8",
  },
  notice_error: {
    backgroundColor: "#fff1f1",
    borderColor: "#f1c6c6",
  },
  notice_info: {
    backgroundColor: "#fffaf6",
    borderColor: colors.border,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
