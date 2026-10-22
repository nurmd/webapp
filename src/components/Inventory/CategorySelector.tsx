import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ItemCategory,
  CATEGORY_COLOR_PALETTE,
  CATEGORY_ICON_OPTIONS,
} from '../../models/category.ts';
import { db } from '../../services/db.ts';
import { showAppToast } from '../../services/toast.ts';

export interface CategorySelectorProps {
  value: string;
  onChange: (categoryName: string, categoryObj?: ItemCategory) => void;
  className?: string;
  onOpenManagement?: () => void;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  value,
  onChange,
  className = '',
  onOpenManagement,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState<ItemCategory[]>(() => db.getCategories());
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickColor, setQuickColor] = useState(CATEGORY_COLOR_PALETTE[0]);
  const [quickIcon, setQuickIcon] = useState(CATEGORY_ICON_OPTIONS[0].icon);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputSearchRef = useRef<HTMLInputElement>(null);

  // Sync categories whenever dropdown is opened
  useEffect(() => {
    if (isOpen) {
      setCategories(db.getCategories());
      setSearchQuery('');
      setShowQuickAdd(false);
      setTimeout(() => {
        inputSearchRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowQuickAdd(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const activeCategory = useMemo(() => {
    const trimmed = (value || '').trim().toLowerCase();
    return categories.find((c) => c.name.toLowerCase() === trimmed);
  }, [value, categories]);

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [searchQuery, categories]);

  const exactMatchExists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return categories.some((c) => c.name.toLowerCase() === q);
  }, [searchQuery, categories]);

  const handleSelect = (cat: ItemCategory) => {
    onChange(cat.name, cat);
    setIsOpen(false);
  };

  const handleCreateFast = (nameToCreate: string) => {
    const trimmed = nameToCreate.trim();
    if (!trimmed) return;
    
    // Choose random color
    const randomColor = CATEGORY_COLOR_PALETTE[Math.floor(Math.random() * CATEGORY_COLOR_PALETTE.length)];
    const newCategory: ItemCategory = {
      id: `cat_${Date.now()}`,
      name: trimmed,
      color: randomColor,
      icon: 'category',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = db.saveCategory(newCategory);
    setCategories(db.getCategories());
    onChange(saved.name, saved);
    showAppToast(`Category "${saved.name}" created`);
    setIsOpen(false);
    setShowQuickAdd(false);
  };

  const handleCreateDetailed = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmed = quickName.trim();
    if (!trimmed) return;

    const newCategory: ItemCategory = {
      id: `cat_${Date.now()}`,
      name: trimmed,
      color: quickColor,
      icon: quickIcon,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = db.saveCategory(newCategory);
    setCategories(db.getCategories());
    onChange(saved.name, saved);
    showAppToast(`Category "${saved.name}" created`);
    setIsOpen(false);
    setShowQuickAdd(false);
    setQuickName('');
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Selected category trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs focus:outline-none focus:border-secondary flex items-center justify-between transition-colors shadow-2xs hover:border-secondary/60"
        title="Select or change category"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: activeCategory?.color || '#64748b' }}
          />
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">
            {activeCategory?.icon || 'category'}
          </span>
          <span className="font-semibold truncate">
            {value || 'General'}
          </span>
          {activeCategory?.defaultGstRate !== undefined && (
            <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant font-medium">
              GST {activeCategory.defaultGstRate}%
            </span>
          )}
        </div>
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant transition-transform shrink-0">
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-72 animate-in fade-in-50 zoom-in-95">
          {/* Search bar */}
          <div className="p-2 border-b border-outline-variant/15 flex items-center gap-2 bg-surface-container-low/40">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">
              search
            </span>
            <input
              ref={inputSearchRef}
              type="text"
              placeholder="Search or type category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim() && !exactMatchExists) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreateFast(searchQuery);
                }
              }}
              className="w-full bg-transparent text-xs text-on-surface focus:outline-none placeholder:text-on-surface-variant/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-on-surface-variant hover:text-on-surface p-0.5"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          {/* Quick Create Prompt if typed text doesn't match */}
          {searchQuery.trim() && !exactMatchExists && !showQuickAdd && (
            <div className="p-2 bg-secondary/5 border-b border-secondary/15">
              <button
                type="button"
                onClick={() => handleCreateFast(searchQuery)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-secondary/10 hover:bg-secondary/20 text-secondary text-xs font-semibold transition-colors text-left"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  <span>Create &quot;{searchQuery.trim()}&quot;</span>
                </span>
                <span className="text-[10px] opacity-75 font-normal">Press Enter</span>
              </button>
            </div>
          )}

          {/* Quick Add Form Expanded */}
          {showQuickAdd ? (
            <div className="p-3 bg-surface-container-low/60 flex flex-col gap-2.5 border-b border-outline-variant/20">
              <div className="text-[11px] font-bold text-on-surface flex items-center justify-between">
                <span>New Category</span>
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>

              <input
                type="text"
                placeholder="Category Name"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCreateDetailed(e);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowQuickAdd(false);
                  }
                }}
                autoFocus
                className="w-full h-8 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-xs text-on-surface focus:outline-none focus:border-secondary"
              />

              {/* Color dots */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                {CATEGORY_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setQuickColor(c)}
                    className={`w-5 h-5 rounded-full shrink-0 transition-transform ${quickColor === c ? 'scale-125 ring-2 ring-secondary ring-offset-1 ring-offset-surface' : 'opacity-80'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="px-2.5 py-1 text-xs text-on-surface-variant font-medium hover:bg-surface-container-high rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateDetailed}
                  disabled={!quickName.trim()}
                  className="px-3 py-1 text-xs bg-secondary text-on-secondary font-semibold rounded-md shadow-xs disabled:opacity-50"
                >
                  Save &amp; Select
                </button>
              </div>
            </div>
          ) : (
            /* Category items list */
            <div className="overflow-y-auto flex-1 p-1 divide-y divide-outline-variant/10">
              {filteredCategories.length === 0 ? (
                <div className="py-4 text-center text-xs text-on-surface-variant">
                  No matching categories found
                </div>
              ) : (
                filteredCategories.map((cat) => {
                  const isSelected = (value || '').trim().toLowerCase() === cat.name.toLowerCase();
                  return (
                    <button
                      key={cat.id || cat.name}
                      type="button"
                      onClick={() => handleSelect(cat)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-secondary/15 text-secondary font-bold'
                          : 'hover:bg-surface-container-high/60 text-on-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color || '#64748b' }}
                        />
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">
                          {cat.icon || 'category'}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">{cat.name}</span>
                          {(cat.defaultGstRate !== undefined || cat.defaultHsn) && (
                            <span className="text-[10px] text-on-surface-variant font-normal">
                              {cat.defaultGstRate !== undefined && `GST ${cat.defaultGstRate}%`}
                              {cat.defaultGstRate !== undefined && cat.defaultHsn && ' • '}
                              {cat.defaultHsn && `HSN ${cat.defaultHsn}`}
                            </span>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <span className="material-symbols-outlined text-[16px] text-secondary shrink-0">
                          check
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Footer actions */}
          <div className="p-2 border-t border-outline-variant/15 bg-surface-container-low/40 flex items-center justify-between text-xs">
            {!showQuickAdd && (
              <button
                type="button"
                onClick={() => {
                  setQuickName(searchQuery.trim());
                  setShowQuickAdd(true);
                }}
                className="flex items-center gap-1 text-secondary font-semibold hover:underline"
              >
                <span className="material-symbols-outlined text-[15px]">add</span>
                <span>Add Category</span>
              </button>
            )}

            {onOpenManagement && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenManagement();
                }}
                className="ml-auto flex items-center gap-1 text-[11px] text-on-surface-variant hover:text-on-surface font-medium"
              >
                <span className="material-symbols-outlined text-[14px]">settings</span>
                <span>Manage</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
