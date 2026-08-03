import { baseColors, type Theme } from "@/styles/theme";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";

export function getStatusDotColor(input: {
  theme: Theme;
  bucket: SidebarStateBucket;
  showDoneAsInactive?: boolean;
}): string | null {
  const { theme, bucket, showDoneAsInactive = false } = input;

  // Working and needs_input share amber: both mean "this agent has your turn in it". They
  // never collide in practice because needs_input always draws the alert glyph, never a bare
  // dot — see getProjectStatusBadgeContent.
  if (bucket === "needs_input") {
    return theme.colors.palette.amber[500];
  }
  if (bucket === "failed") {
    return theme.colors.palette.red[500];
  }
  if (bucket === "running") {
    return theme.colors.palette.amber[500];
  }
  if (bucket === "attention") {
    return theme.colors.palette.green[500];
  }
  if (bucket === "done") {
    return showDoneAsInactive ? theme.colors.border : null;
  }
  return null;
}

// The palette is identical across themes (theme.colors.palette === baseColors), so
// status dots can resolve a concrete color without a theme. Null means "no dot".
export function getStatusDotBaseColor(bucket: SidebarStateBucket): string | null {
  switch (bucket) {
    case "needs_input":
      return baseColors.amber[500];
    case "failed":
      return baseColors.red[500];
    case "running":
      return baseColors.blue[500];
    case "attention":
      return baseColors.green[500];
    case "done":
      return null;
  }
}

export function isEmphasizedStatusDotBucket(
  bucket: SidebarStateBucket | null | undefined,
): boolean {
  return bucket === "needs_input" || bucket === "attention";
}
