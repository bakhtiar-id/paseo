import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { getProviderIcon } from "@/components/provider-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProviderUsageCard } from "@/provider-usage/card";
import { clampPct, formatPct } from "@/provider-usage/format";
import { deriveTone } from "@/provider-usage/tone";
import { useProviderUsage } from "@/provider-usage/use-provider-usage";
import type { ProviderUsage, ProviderUsageTone } from "@/provider-usage/types";
import type { Theme } from "@/styles/theme";
import { footerUsageWindows, type FooterUsageWindow } from "./footer-stats";

// Beyond this the strip would crowd out the rest of the footer; the remainder
// collapses into a "+N" chip.
const MAX_VISIBLE_CHIPS = 4;
// Most providers expose ≤2 quota windows; extra windows still show in the tooltip card.
const MAX_WINDOW_CELLS = 2;

function ProviderChipIcon({
  iconKey,
  size,
  color = "",
}: {
  iconKey: string;
  size: number;
  color?: string;
}) {
  const Icon = getProviderIcon(iconKey);
  return <Icon size={size} color={color} />;
}

const ThemedProviderChipIcon = withUnistyles(ProviderChipIcon);
const mutedIconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function fillToneStyle(tone: ProviderUsageTone) {
  switch (tone) {
    case "ok":
      return styles.fillOk;
    case "warning":
      return styles.fillWarning;
    case "danger":
      return styles.fillDanger;
    default:
      return styles.fillDefault;
  }
}

// Battery-style gauge: bar length and number both show what is LEFT, not used.
function WindowCell({ row }: { row: FooterUsageWindow }) {
  const { window, remainingPct } = row;
  const tone = window.tone ?? deriveTone(100 - clampPct(remainingPct));
  const fillStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.fill, fillToneStyle(tone), { width: `${clampPct(remainingPct)}%` }],
    [tone, remainingPct],
  );

  return (
    <View style={styles.windowCell}>
      <View style={styles.windowCellText}>
        <Text style={styles.windowLabel} numberOfLines={1}>
          {window.label}
        </Text>
        <Text style={styles.windowValue}>{formatPct(remainingPct)}</Text>
      </View>
      <View style={styles.track}>
        <View style={fillStyle} />
      </View>
    </View>
  );
}

function ProviderLimitChip({ usage }: { usage: ProviderUsage }) {
  const rows = footerUsageWindows(usage);
  const worst = rows[0];

  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger
        accessibilityRole="button"
        accessibilityLabel={
          worst
            ? `${usage.displayName} ${formatPct(worst.remainingPct)} remaining`
            : usage.displayName
        }
        style={styles.chip}
        testID={`status-footer-provider-${usage.providerId}`}
      >
        <ThemedProviderChipIcon iconKey={usage.providerId} size={12} uniProps={mutedIconColor} />
        <View style={styles.chipCells}>
          {rows.length === 0 ? (
            <Text style={styles.windowValue}>—</Text>
          ) : (
            rows
              .slice(0, MAX_WINDOW_CELLS)
              .map((row) => <WindowCell key={row.window.id} row={row} />)
          )}
        </View>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" maxWidth={320} style={styles.tooltip}>
        <ProviderUsageCard usage={usage} compact />
      </TooltipContent>
    </Tooltip>
  );
}

export function ProviderLimitChips({ serverId }: { serverId: string | null }) {
  const { t } = useTranslation();
  const { view } = useProviderUsage(serverId);

  if (view.kind !== "ready") {
    // Loading and error both collapse to one muted placeholder — the footer is
    // not the place to explain a quota fetch failure. Host settings is.
    return (
      <Text style={styles.placeholder} numberOfLines={1}>
        {t("statusFooter.limitsUnavailable")}
      </Text>
    );
  }

  const providers = view.payload.providers.filter((usage) => usage.windows.length > 0);
  if (providers.length === 0) {
    return null;
  }

  const visible = providers.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = providers.length - visible.length;

  return (
    <View style={styles.strip} testID="status-footer-provider-limits">
      {visible.map((usage, index) => (
        <Fragment key={usage.providerId}>
          {index > 0 ? <View style={styles.separator} /> : null}
          <ProviderLimitChip usage={usage} />
        </Fragment>
      ))}
      {overflow > 0 ? (
        <>
          <View style={styles.separator} />
          <Text style={styles.overflow}>
            {t("statusFooter.moreProviders", { count: overflow })}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 1,
    minWidth: 0,
  },
  separator: {
    width: theme.borderWidth[1],
    height: 12,
    backgroundColor: theme.colors.border,
    flexShrink: 0,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
    flexShrink: 0,
  },
  chipCells: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  windowCell: {
    gap: 1,
    width: 52,
  },
  windowCellText: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: theme.spacing[1],
  },
  windowLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: 9,
    flexShrink: 1,
  },
  windowValue: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: 9,
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.surface3,
    overflow: "hidden",
  },
  fill: {
    height: 2,
    borderRadius: 1,
  },
  fillDefault: {
    backgroundColor: theme.colors.foregroundMuted,
  },
  fillOk: {
    backgroundColor: theme.colors.statusSuccess,
  },
  fillWarning: {
    backgroundColor: theme.colors.statusWarning,
  },
  fillDanger: {
    backgroundColor: theme.colors.statusDanger,
  },
  overflow: {
    color: theme.colors.foregroundExtraMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: 10,
    flexShrink: 0,
  },
  placeholder: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
    flexShrink: 1,
  },
  tooltip: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
}));
