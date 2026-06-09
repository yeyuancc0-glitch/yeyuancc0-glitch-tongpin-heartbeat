import { View } from "react-native";

import { Card } from "@/components/app-ui/AppUI";
import { styles } from "@/features/home/homeStyles";
import { BreathingSkeleton } from "@/motion/BreathingSkeleton";

export function HomeScreenShell() {
  return (
    <View style={styles.stack}>
      <Card soft style={styles.heroCard}>
        <View style={styles.shellAvatarRow}>
          <BreathingSkeleton style={styles.shellAvatar} />
          <BreathingSkeleton style={[styles.shellAvatar, styles.shellAvatarSecond]} />
        </View>
        <BreathingSkeleton style={styles.shellHeroTitle} />
        <BreathingSkeleton style={styles.shellHeroNumber} />
        <BreathingSkeleton style={styles.shellHeroDate} />
      </Card>

      <Card style={styles.moodStatusCard}>
        <View style={styles.sectionHeader}>
          <BreathingSkeleton style={styles.shellSectionTitle} />
          <BreathingSkeleton style={styles.shellPill} />
        </View>
        <View style={styles.statusGrid}>
          <ShellStatusPill />
          <ShellStatusPill />
        </View>
        <View style={styles.interactionGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <View key={index} style={styles.shellInteractionButton}>
              <BreathingSkeleton style={styles.shellInteractionIcon} />
              <BreathingSkeleton style={styles.shellInteractionText} />
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <BreathingSkeleton style={styles.shellSectionTitle} />
          <BreathingSkeleton style={styles.shellRoundButton} />
        </View>
        <BreathingSkeleton style={styles.shellMessageInput} />
        <BreathingSkeleton style={styles.shellPrimaryButton} />
      </Card>

      <Card style={styles.photoAlbumCard}>
        <View style={styles.photoAlbumHeader}>
          <View style={styles.photoAlbumTitleGroup}>
            <BreathingSkeleton style={styles.shellSectionTitle} />
            <BreathingSkeleton style={styles.shellSmallText} />
          </View>
          <BreathingSkeleton style={styles.shellRoundButton} />
        </View>
        <View style={styles.photoAlbumGrid}>
          {Array.from({ length: 9 }).map((_, index) => (
            <BreathingSkeleton key={index} style={[styles.photoAlbumThumb, styles.shellPhotoThumb]} />
          ))}
        </View>
      </Card>
    </View>
  );
}

function ShellStatusPill() {
  return (
    <View style={styles.statusPill}>
      <BreathingSkeleton style={styles.shellSmallText} />
      <BreathingSkeleton style={styles.shellStatusValue} />
    </View>
  );
}
