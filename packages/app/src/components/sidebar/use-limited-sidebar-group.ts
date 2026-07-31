import { useCallback, useMemo, useState } from "react";

const DEFAULT_INITIAL_VISIBLE_ITEMS = 20;

export function useLimitedSidebarGroup<T>(
  items: readonly T[],
  initialVisible: number = DEFAULT_INITIAL_VISIBLE_ITEMS,
) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = useMemo(
    () => (expanded ? items.slice() : items.slice(0, initialVisible)),
    [expanded, items, initialVisible],
  );
  const canToggle = items.length > initialVisible;
  const toggleExpanded = useCallback(() => setExpanded((current) => !current), []);

  return { visibleItems, expanded, canToggle, toggleExpanded };
}
