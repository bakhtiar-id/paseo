import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export type StatusBucket = SidebarWorkspaceEntry["statusBucket"];

export const STATUS_BUCKET_ORDER: readonly StatusBucket[] = [
  "needs_input",
  "failed",
  "attention",
  "running",
  "done",
] as const;

// Default labels — the i18n hook below overrides them with translated strings.
export const STATUS_BUCKET_LABELS: Record<StatusBucket, string> = {
  needs_input: "Needs input",
  failed: "Failed",
  attention: "Ready to review",
  running: "Working",
  done: "Done",
};

export function useStatusBucketLabels(): Record<StatusBucket, string> {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      needs_input: t("sidebar.statusBuckets.needsInput"),
      failed: t("sidebar.statusBuckets.failed"),
      attention: t("sidebar.statusBuckets.attention"),
      running: t("sidebar.statusBuckets.running"),
      done: t("sidebar.statusBuckets.done"),
    }),
    [t],
  );
}

export interface StatusGroup {
  bucket: StatusBucket;
  label: string;
  rows: SidebarWorkspaceEntry[];
}

export function buildStatusGroups(
  workspaces: SidebarWorkspaceEntry[],
  projectNamesByKey: Map<string, string>,
  labels: Record<StatusBucket, string> = STATUS_BUCKET_LABELS,
): StatusGroup[] {
  const bucketRows = new Map<StatusBucket, SidebarWorkspaceEntry[]>();

  for (const ws of workspaces) {
    const bucket: StatusBucket = ws.statusBucket;
    let rows = bucketRows.get(bucket);
    if (!rows) {
      rows = [];
      bucketRows.set(bucket, rows);
    }
    rows.push(ws);
  }

  const groups: StatusGroup[] = [];

  for (const bucket of STATUS_BUCKET_ORDER) {
    const rows = bucketRows.get(bucket);
    if (!rows || rows.length === 0) continue;

    rows.sort((a, b) => compareStatusRows(a, b, projectNamesByKey));
    groups.push({ bucket, label: labels[bucket], rows });
  }

  return groups;
}

function compareStatusRows(
  a: SidebarWorkspaceEntry,
  b: SidebarWorkspaceEntry,
  projectNamesByKey: Map<string, string>,
): number {
  const aTime = a.statusEnteredAt?.getTime() ?? null;
  const bTime = b.statusEnteredAt?.getTime() ?? null;

  if (aTime !== null && bTime !== null) {
    if (aTime !== bTime) return bTime - aTime;
  } else if (aTime !== null) {
    return -1;
  } else if (bTime !== null) {
    return 1;
  }

  const aProject = projectNamesByKey.get(a.projectKey) ?? "";
  const bProject = projectNamesByKey.get(b.projectKey) ?? "";
  const projectCmp = aProject.localeCompare(bProject);
  if (projectCmp !== 0) return projectCmp;

  const nameCmp = a.name.localeCompare(b.name);
  if (nameCmp !== 0) return nameCmp;

  return a.workspaceKey.localeCompare(b.workspaceKey);
}

export function buildStatusShortcutIndex(groups: StatusGroup[]): Map<string, number> {
  const index = new Map<string, number>();
  let shortcutNumber = 1;
  for (const group of groups) {
    for (const row of group.rows) {
      if (shortcutNumber > 9) return index;
      index.set(row.workspaceKey, shortcutNumber);
      shortcutNumber += 1;
    }
  }
  return index;
}
