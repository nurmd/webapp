import React, { useState, useMemo } from 'react';
import { PartyGroup, PartyCategory } from '../../../models/party.ts';
import { CATEGORY_COLOR_PALETTE } from '../../../models/category.ts';
import { db } from '../../../services/db.ts';
import { rbac } from '../../../services/rbac.ts';
import { usePartyGroups, usePartyCategories, useParties } from '../../../core/store/useDataStore.ts';
import { useBackNavigation } from '../../../core/utils/backNavigation.ts';
import { showAppToast } from '../../../services/toast.ts';
import { ConfirmDeleteModal } from '../../Common/ConfirmDeleteModal.tsx';

export interface PartyGroupsCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'GROUPS' | 'CATEGORIES';
}

export const PartyGroupsCategoriesModal: React.FC<PartyGroupsCategoriesModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'GROUPS',
}) => {
  const [activeTab, setActiveTab] = useState<'GROUPS' | 'CATEGORIES'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingItem, setEditingItem] = useState<PartyGroup | PartyCategory | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState(CATEGORY_COLOR_PALETTE[0]);
  const [formError, setFormError] = useState('');

  // Delete State
  const [deletingItem, setDeletingItem] = useState<{
    type: 'GROUP' | 'CATEGORY';
    item: PartyGroup | PartyCategory;
  } | null>(null);

  const groups = usePartyGroups();
  const categories = usePartyCategories();
  const parties = useParties();

  useBackNavigation(() => {
    if (deletingItem) {
      setDeletingItem(null);
      return;
    }
    if (isCreating || editingItem) {
      handleCancelForm();
      return;
    }
    onClose();
  }, isOpen, 45);

  // Calculate party counts per group and per category
  const groupCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of parties) {
      if (p.groupId) {
        map[p.groupId] = (map[p.groupId] || 0) + 1;
      }
    }
    return map;
  }, [parties]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of parties) {
      if (p.categoryId) {
        map[p.categoryId] = (map[p.categoryId] || 0) + 1;
      }
    }
    return map;
  }, [parties]);

  if (!isOpen) return null;

  const handleStartCreate = () => {
    setEditingItem(null);
    setFormName('');
    setFormDescription('');
    setFormColor(CATEGORY_COLOR_PALETTE[Math.floor(Math.random() * CATEGORY_COLOR_PALETTE.length)]);
    setFormError('');
    setIsCreating(true);
  };

  const handleStartEdit = (item: PartyGroup | PartyCategory) => {
    setIsCreating(false);
    setEditingItem(item);
    setFormName(item.name);
    setFormDescription(item.description || '');
    setFormColor(item.color || CATEGORY_COLOR_PALETTE[0]);
    setFormError('');
  };

  const handleCancelForm = () => {
    setIsCreating(false);
    setEditingItem(null);
    setFormName('');
    setFormDescription('');
    setFormError('');
  };

  const handleSaveForm = (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError(`${activeTab === 'GROUPS' ? 'Group' : 'Category'} name is required.`);
      return;
    }

    if (activeTab === 'GROUPS') {
      const existing = groups.find(
        (g) =>
          g.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
          (!editingItem || g.id !== editingItem.id)
      );
      if (existing) {
        setFormError(`A party group named "${trimmedName}" already exists.`);
        return;
      }

      try {
        const toSave: PartyGroup = {
          id: editingItem ? editingItem.id : `pgrp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: trimmedName,
          description: formDescription.trim() || undefined,
          color: formColor,
          createdAt: editingItem?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.savePartyGroup(toSave);
        showAppToast(
          editingItem
            ? `Party group "${trimmedName}" updated.`
            : `Party group "${trimmedName}" created.`
        );
        handleCancelForm();
      } catch (err: any) {
        setFormError(err?.message || 'Failed to save party group');
      }
    } else {
      const existing = categories.find(
        (c) =>
          c.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
          (!editingItem || c.id !== editingItem.id)
      );
      if (existing) {
        setFormError(`A party category named "${trimmedName}" already exists.`);
        return;
      }

      try {
        const toSave: PartyCategory = {
          id: editingItem ? editingItem.id : `pcat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: trimmedName,
          description: formDescription.trim() || undefined,
          color: formColor,
          createdAt: editingItem?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.savePartyCategory(toSave);
        showAppToast(
          editingItem
            ? `Party category "${trimmedName}" updated.`
            : `Party category "${trimmedName}" created.`
        );
        handleCancelForm();
      } catch (err: any) {
        setFormError(err?.message || 'Failed to save party category');
      }
    }
  };

  const handleRequestDelete = (item: PartyGroup | PartyCategory, type: 'GROUP' | 'CATEGORY') => {
    if (!rbac.canDeleteParty()) {
      showAppToast('Permission denied: You do not have permission to delete party groups or categories.');
      return;
    }
    setDeletingItem({ type, item });
  };

  const handleConfirmDelete = () => {
    if (!deletingItem) return;
    try {
      if (deletingItem.type === 'GROUP') {
        db.deletePartyGroup(deletingItem.item.id);
        showAppToast(`Party group "${deletingItem.item.name}" deleted. Linked parties unassigned.`);
      } else {
        db.deletePartyCategory(deletingItem.item.id);
        showAppToast(`Party category "${deletingItem.item.name}" deleted. Linked parties unassigned.`);
      }
    } catch (err: any) {
      showAppToast(err?.message || 'Failed to delete');
    } finally {
      setDeletingItem(null);
    }
  };

  const currentList = activeTab === 'GROUPS' ? groups : categories;
  const filteredList = currentList.filter((item) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q))
    );
  });

  const activeCounts = activeTab === 'GROUPS' ? groupCounts : categoryCounts;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in"
        onClick={onClose}
      >
        <div
          className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 bg-surface-container-low/40">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-secondary text-[24px]">
                folder_special
              </span>
              <div>
                <h3 className="font-headline-sm text-base sm:text-lg font-bold text-on-surface leading-tight">
                  Party Groups &amp; Categories
                </h3>
                <p className="text-[11px] text-on-surface-variant">
                  Organize your customers and suppliers with custom groups and classifications
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
              title="Close modal"
              aria-label="Close modal"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* 2. Tabs */}
          <div className="px-5 pt-3 pb-2 border-b border-outline-variant/15 flex items-center justify-between gap-3 bg-surface-container-low/20">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-container-high/60">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('GROUPS');
                  handleCancelForm();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'GROUPS'
                    ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] text-secondary">group_work</span>
                <span>Groups</span>
                <span className="px-1.5 py-0.2 rounded-full bg-secondary/15 text-secondary text-[10px] font-bold">
                  {groups.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('CATEGORIES');
                  handleCancelForm();
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'CATEGORIES'
                    ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px] text-primary">label</span>
                <span>Categories</span>
                <span className="px-1.5 py-0.2 rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                  {categories.length}
                </span>
              </button>
            </div>

            {!isCreating && !editingItem && (
              <button
                type="button"
                onClick={handleStartCreate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-xs hover:bg-secondary/90 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Add {activeTab === 'GROUPS' ? 'Group' : 'Category'}</span>
              </button>
            )}
          </div>

          {/* 3. Inline Add/Edit Form */}
          {(isCreating || editingItem) && (
            <div className="p-4 bg-surface-container-low/80 border-b border-outline-variant/30 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: formColor }} />
                  {editingItem ? `Edit ${activeTab === 'GROUPS' ? 'Group' : 'Category'}` : `New ${activeTab === 'GROUPS' ? 'Group' : 'Category'}`}
                </span>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="text-on-surface-variant hover:text-on-surface text-[11px]"
                >
                  Cancel
                </button>
              </div>

              {formError && (
                <div className="px-2.5 py-1.5 rounded-lg bg-error-container/40 border border-error/30 text-error text-[11px] font-medium flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="flex-1 flex flex-col gap-1">
                  <label htmlFor="form-name-input" className="text-[10px] font-bold uppercase tracking-wider text-outline">
                    Name *
                  </label>
                  <input
                    id="form-name-input"
                    type="text"
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (formError) setFormError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveForm(e);
                      } else if (e.key === 'Escape') {
                        handleCancelForm();
                      }
                    }}
                    placeholder={activeTab === 'GROUPS' ? 'e.g. VIP Retailers, North Zone' : 'e.g. Wholesale, Regular, Distributor'}
                    autoFocus
                    className="w-full h-8 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-xs text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>

                <div className="flex-1 flex flex-col gap-1">
                  <label htmlFor="form-desc-input" className="text-[10px] font-bold uppercase tracking-wider text-outline">
                    Description (Optional)
                  </label>
                  <input
                    id="form-desc-input"
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveForm(e);
                      } else if (e.key === 'Escape') {
                        handleCancelForm();
                      }
                    }}
                    placeholder="Short description or note"
                    className="w-full h-8 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/40 text-xs text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              {/* Color dots picker */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                  Color Tag
                </label>
                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  {CATEGORY_COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`w-6 h-6 rounded-full shrink-0 transition-transform ${
                        formColor === c
                          ? 'scale-125 ring-2 ring-secondary ring-offset-2 ring-offset-surface'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                      title={`Select color ${c}`}
                      aria-label={`Select color ${c}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveForm}
                  disabled={!formName.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-secondary text-on-secondary shadow-xs hover:bg-secondary/90 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {editingItem ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* 4. Search Filter within List */}
          <div className="px-5 py-2.5 border-b border-outline-variant/15 flex items-center gap-2 bg-surface-container-lowest">
            <span className="material-symbols-outlined text-[18px] text-outline shrink-0">
              search
            </span>
            <input
              type="text"
              placeholder={`Search ${activeTab.toLowerCase()} by name or description...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-transparent text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-on-surface-variant hover:text-on-surface p-0.5"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* 5. Item List */}
          <div className="overflow-y-auto flex-1 p-3 divide-y divide-outline-variant/10 min-h-[220px]">
            {filteredList.length === 0 ? (
              <div className="py-10 text-center flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-[36px] text-outline/50">
                  {activeTab === 'GROUPS' ? 'group_work' : 'label'}
                </span>
                <p className="text-xs font-semibold">
                  {searchQuery
                    ? `No matching ${activeTab.toLowerCase()} found`
                    : `No party ${activeTab === 'GROUPS' ? 'groups' : 'categories'} created yet`}
                </p>
                {!searchQuery && !isCreating && !editingItem && (
                  <button
                    type="button"
                    onClick={handleStartCreate}
                    className="mt-1 px-3 py-1.5 rounded-xl bg-secondary/10 hover:bg-secondary/20 text-secondary text-xs font-bold transition-colors cursor-pointer"
                  >
                    + Create First {activeTab === 'GROUPS' ? 'Group' : 'Category'}
                  </button>
                )}
              </div>
            ) : (
              filteredList.map((item) => {
                const count = activeCounts[item.id] || 0;
                return (
                  <div
                    key={item.id}
                    className="py-2.5 px-3 flex items-center justify-between gap-3 hover:bg-surface-container-high/40 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
                        style={{ backgroundColor: item.color || '#64748b' }}
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-on-surface truncate">
                            {item.name}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.2 rounded-full font-bold ${
                              count > 0
                                ? 'bg-secondary/15 text-secondary'
                                : 'bg-surface-container-high text-on-surface-variant/80'
                            }`}
                          >
                            {count} {count === 1 ? 'party' : 'parties'}
                          </span>
                        </div>
                        {item.description && (
                          <span className="text-[11px] text-on-surface-variant truncate mt-0.5">
                            {item.description}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
                        title={`Edit ${item.name}`}
                        aria-label={`Edit ${item.name}`}
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleRequestDelete(item, activeTab === 'GROUPS' ? 'GROUP' : 'CATEGORY')
                        }
                        className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-error-container/30 transition-colors cursor-pointer"
                        title={`Delete ${item.name}`}
                        aria-label={`Delete ${item.name}`}
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 6. Footer Note */}
          <div className="px-5 py-3 border-t border-outline-variant/20 bg-surface-container-low/30 text-[11px] text-outline flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] text-secondary">info</span>
              <span>Deleting a group or category will unassign it from linked parties without deleting the parties.</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded-lg bg-surface-container-high text-on-surface text-xs font-bold hover:bg-surface-container-highest transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <ConfirmDeleteModal
          isOpen={true}
          title={`Delete ${deletingItem.type === 'GROUP' ? 'Party Group' : 'Party Category'}?`}
          recordName={deletingItem.item.name}
          description={`Are you sure you want to delete "${deletingItem.item.name}"? It is currently assigned to ${
            (deletingItem.type === 'GROUP' ? groupCounts[deletingItem.item.id] : categoryCounts[deletingItem.item.id]) || 0
          } party/parties. Deleting this will unassign them. Parties will not be deleted.`}
          confirmText="Delete & Unassign"
          onConfirm={handleConfirmDelete}
          onClose={() => setDeletingItem(null)}
        />
      )}
    </>
  );
};
