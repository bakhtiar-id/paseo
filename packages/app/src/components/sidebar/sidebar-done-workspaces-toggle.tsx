import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { Archive, ChevronDown, ChevronUp, MoreVertical } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { isNative as platformIsNative } from "@/constants/platform";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Theme } from "@/styles/theme";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronUp = withUnistyles(ChevronUp);
const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedArchive = withUnistyles(Archive);
const foregroundMutedIconMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const archiveLeadingIcon = <ThemedArchive size={14} uniProps={foregroundMutedIconMapping} />;

// The menu is a sibling overlay of the row Pressable so DOM buttons never nest
// (nested <button> invalidates the HTML and fires hydration warnings).
function stopTriggerPropagation(event: { stopPropagation?: () => void }) {
  event.stopPropagation?.();
}

function menuTriggerStyle({
  hovered = false,
  pressed,
}: PressableStateCallbackType & {
  hovered?: boolean;
}) {
  return [styles.menuTrigger, (Boolean(hovered) || pressed) && styles.menuTriggerHovered];
}

function DoneRowMenu({
  count,
  onArchiveAll,
  testID,
}: {
  count: number;
  onArchiveAll: () => void;
  testID: string;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        hitSlop={8}
        onPressIn={stopTriggerPropagation}
        style={menuTriggerStyle}
        accessibilityRole="button"
        accessibilityLabel={t("sidebar.workspaces.doneMenu")}
        testID={testID}
      >
        <ThemedMoreVertical size={13} uniProps={foregroundMutedIconMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={230}>
        <DropdownMenuItem
          testID={`${testID}-archive-all`}
          leading={archiveLeadingIcon}
          onSelect={onArchiveAll}
        >
          {t("sidebar.workspaces.archiveAllDone", { count })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Quiet collapse toggle under a project row: done workspaces are swept behind
 * it ("2 done · show"). Rendered at workspace-row indentation.
 */
export function SidebarDoneWorkspacesToggle({
  count,
  expanded,
  onPress,
  onArchiveAll,
  testID,
}: {
  count: number;
  expanded: boolean;
  onPress: () => void;
  /** When provided, a ⋯ menu with "archive all done" renders at the row's end. */
  onArchiveAll?: () => void;
  testID: string;
}) {
  const { t } = useTranslation();
  const label = t(expanded ? "sidebar.workspaces.hideDone" : "sidebar.workspaces.showDone", {
    count,
  });
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (Boolean(hovered) || pressed) && styles.rowHovered,
    ],
    [],
  );
  const Chevron = expanded ? ThemedChevronUp : ThemedChevronDown;
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);
  // Keep the ⋯ menu out of the way until the row is hovered; touch platforms
  // have no hover, so it stays visible there.
  const [isRowHovered, setIsRowHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsRowHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsRowHovered(false), []);
  const showMenu = isRowHovered || platformIsNative;

  return (
    <View
      style={styles.rowWrap}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={accessibilityState}
        onPress={onPress}
        style={rowStyle}
        testID={testID}
      >
        <Chevron size={12} uniProps={foregroundMutedIconMapping} />
        <Text style={styles.text} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      {onArchiveAll && showMenu ? (
        <View style={styles.menuSlot} pointerEvents="auto">
          <DoneRowMenu count={count} onArchiveAll={onArchiveAll} testID={`${testID}-menu`} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  rowWrap: {
    position: "relative",
  },
  menuSlot: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: theme.spacing[1],
    justifyContent: "center",
  },
  row: {
    minHeight: 26,
    marginLeft: theme.spacing[4] + 2,
    marginRight: theme.spacing[1],
    paddingVertical: 2,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    userSelect: "none",
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  text: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
    minWidth: 0,
    flexShrink: 1,
    flexGrow: 1,
  },
  menuTrigger: {
    padding: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  menuTriggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));
