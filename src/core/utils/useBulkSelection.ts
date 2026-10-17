import { useState, useCallback, useMemo } from 'react';

export interface UseBulkSelectionReturn {
  selectedIds: Set<string>;
  selectedCount: number;
  isSelected: (id: string) => boolean;
  toggleSelect: (id: string) => void;
  selectAll: (allIds: string[]) => void;
  clearSelection: () => void;
  isAllSelected: (allIds: string[]) => boolean;
  isIndeterminate: (allIds: string[]) => boolean;
  getSelectedList: () => string[];
}

export function useBulkSelection(initialSelected: string[] = []): UseBulkSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(initialSelected));

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((allIds: string[]) => {
    setSelectedIds((prev) => {
      // If all currently visible are selected, unselect them; otherwise select all
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
      if (allSelected) {
        return new Set();
      }
      return new Set(allIds);
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isAllSelected = useCallback(
    (allIds: string[]) => {
      if (allIds.length === 0) return false;
      return allIds.every((id) => selectedIds.has(id));
    },
    [selectedIds]
  );

  const isIndeterminate = useCallback(
    (allIds: string[]) => {
      if (allIds.length === 0) return false;
      const count = allIds.filter((id) => selectedIds.has(id)).length;
      return count > 0 && count < allIds.length;
    },
    [selectedIds]
  );

  const getSelectedList = useCallback(() => {
    return Array.from(selectedIds);
  }, [selectedIds]);

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  return {
    selectedIds,
    selectedCount,
    isSelected,
    toggleSelect,
    selectAll,
    clearSelection,
    isAllSelected,
    isIndeterminate,
    getSelectedList,
  };
}
