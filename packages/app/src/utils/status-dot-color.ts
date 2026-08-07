import { baseColors, type Theme } from "@/styles/theme";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";

export function getStatusDotColor(input: {
  theme: Theme;
  bucket: SidebarStateBucket;
  showDoneAsInactive?: boolean;
}): string | null {
  const { theme, bucket, showDoneAsInactive = false } = input;

  // The one place the statusDot* band is read. Dots sit louder than the check icons and host
  // badges on the same row — see the band's note in theme.ts — so going through the status
  // family here instead would quietly put the row's state below its metadata.
  //
  // needs_input is amber because it wants something from you. Working is blue: an agent doing
  // its job is the one busy state that asks for nothing, so it should not sit in the same
  // color as the states that do.
  if (bucket === "needs_input") {
    return theme.colors.statusDotWarning;
  }
  if (bucket === "failed") {
    return theme.colors.statusDotDanger;
  }
  if (bucket === "running") {
    return theme.colors.statusDotRunning;
  }
  if (bucket === "attention") {
    return theme.colors.statusDotSuccess;
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
