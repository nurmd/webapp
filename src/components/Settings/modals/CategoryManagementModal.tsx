import React, { useState, useMemo } from 'react';
import {
  ItemCategory,
  CATEGORY_COLOR_PALETTE,
  CATEGORY_ICON_OPTIONS,
} from '../../../models/category.ts';
import { db } from '../../../services/db.ts';
import { useBackNavigation } from '../../../core/utils/backNavigation.ts';
import { showAppToast } from '../../../services/toast.ts';
import { ConfirmDeleteModal } from '../../Common/ConfirmDeleteModal.tsx';

export interface CategoryManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoriesUpdated?: () => void;
}

export const CategoryManagementModal: React.FC<CategoryManagementModalProps> = ({
  isOpen,
  onClose,
  onCategoriesUpdated,
}) => {
  // Reset Confirmation State
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Delete Confirmation State
  const [deletingCat, setDeletingCat] = useState<ItemCategory | null>(null);
  const [reassignTarget, setReassignTarget] = useState('General');

  useBackNavigation(() => {
    if (showResetConfirm) {
      setShowResetConfirm(false);
      return;
    }
    if (deletingCat) {
      setDeletingCat(null);
      return;
    }
    onClose();
  }, isOpen, 45);

  const [categories, setCategories] = useState<ItemCategory[]>(() => db.getCategories());
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCategory, setEditingCategory] = useState<ItemCategory | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState(CATEGORY_COLOR_PALETTE[0]);
  const [formIcon, setFormIcon] = useState(CATEGORY_ICON_OPTIONS[0].icon);
  const [formGstRate, setFormGstRate] = useState<string>('NONE');
  const [formHsn, setFormHsn] = useState('');
  const [formError, setFormError] = useState('');

  // Compute item count per category from live catalog
  const items = useMemo(() => db.getItems(), [isOpen, categories]);
  const itemCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      const c = item.category?.trim() || 'General';
      map[c] = (map[c] || 0) + 1;
    }
    return map;
  }, [items]);

  const reloadCategories = () => {
    const list = db.getCategories();
    setCategories(list);
    if (onCategoriesUpdated) {
      onCategoriesUpdated();
    }
  };

  const handleStartCreate = () => {
    setEditingCategory(null);
    setFormName('');
    setFormDescription('');
    setFormColor(CATEGORY_COLOR_PALETTE[Math.floor(Math.random() * CATEGORY_COLOR_PALETTE.length)]);
    setFormIcon(CATEGORY_ICON_OPTIONS[0].icon);
    setFormGstRate('NONE');
    setFormHsn('');
    setFormError('');
    setIsCreating(true);
  };

  const handleStartEdit = (cat: ItemCategory) => {
    setIsCreating(false);
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormDescription(cat.description || '');
    setFormColor(cat.color || CATEGORY_COLOR_PALETTE[0]);
    setFormIcon(cat.icon || 'category');
    setFormGstRate(cat.defaultGstRate !== undefined ? String(cat.defaultGstRate) : 'NONE');
    setFormHsn(cat.defaultHsn || '');
    setFormError('');
  };

  const handleCancelForm = () => {
    setIsCreating(false);
    setEditingCategory(null);
    setFormError('');
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('Category name is required.');
      return;
    }

    // Check duplicate name
    const existing = categories.find(
      (c) =>
        c.name.toLowerCase() === trimmedName.toLowerCase() &&
        (!editingCategory || c.id !== editingCategory.id)
    );
    if (existing) {
      setFormError(`A category named "${trimmedName}" already exists.`);
      return;
    }

    const gstNum = formGstRate !== 'NONE' ? Number(formGstRate) : undefined;
    const catToSave: ItemCategory = {
      id: editingCategory ? editingCategory.id : `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: trimmedName,
      description: formDescription.trim() || undefined,
      color: formColor,
      icon: formIcon,
      defaultGstRate: gstNum,
      defaultHsn: formHsn.trim() || undefined,
      isSystem: editingCategory ? editingCategory.isSystem : false,
      createdAt: editingCategory?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveCategory(catToSave, true);
    showAppToast(
      editingCategory
        ? `Category "${trimmedName}" updated and synchronized across catalog.`
        : `Category "${trimmedName}" created successfully.`
    );
    reloadCategories();
    handleCancelForm();
  };

  const handleConfirmDelete = () => {
    if (!deletingCat) return;
    const result = db.deleteCategory(deletingCat.id, reassignTarget);
    if (result.success) {
      showAppToast(
        result.affectedItems > 0
          ? `Category deleted. ${result.affectedItems} item(s) reassigned to "${reassignTarget}".`
          : `Category "${deletingCat.name}" removed.`
      );
      reloadCategories();
    } else {
      showAppToast('Cannot delete default system category.');
    }
    setDeletingCat(null);
  };

  const handleOpenResetConfirm = () => {
    setShowResetConfirm(true);
  };

  const handleConfirmReset = () => {
    db.resetCategoriesToDefault();
    showAppToast('Categories reset to standard presets.');
    reloadCategories();
    setShowResetConfirm(false);
  };

  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q)) ||
        (c.defaultHsn && c.defaultHsn.toLowerCase().includes(q))
    );
  }, [categories, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="w-full max-w-2xl bg-surface rounded-2xl shadow-2xl border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[24px]">category</span>
            </div>
            <div>
              <h2 id="category-modal-title" className="font-headline-sm text-base sm:text-lg font-bold text-on-surface">
                Item Categories &amp; Hierarchy
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Organize inventory, set default tax slabs, and classify catalog items
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Action Bar */}
        <div className="p-4 border-b border-outline-variant/20 bg-surface-container-lowest flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface focus:outline-none focus:border-secondary"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartCreate}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 shadow-sm transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>New Category</span>
            </button>
            <button
              type="button"
              onClick={handleOpenResetConfirm}
              title="Reset to standard categories"
              aria-label="Reset to standard categories"
              className="p-2 rounded-xl border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
            </button>
          </div>
        </div>

        {/* Content Area: Form OR List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Create / Edit Form Drawer */}
          {(isCreating || editingCategory) && (
            <form
              onSubmit={handleSaveForm}
              className="bg-surface-container-low/80 rounded-2xl p-4 border border-secondary/30 shadow-sm space-y-3.5 animate-fade-in"
            >
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                <span className="font-label-md text-xs font-bold text-secondary uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">
                    {isCreating ? 'add_circle' : 'edit_square'}
                  </span>
                  {isCreating ? 'Create New Category' : `Edit Category: ${editingCategory?.name}`}
                </span>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="text-xs text-on-surface-variant hover:text-on-surface"
                >
                  Cancel
                </button>
              </div>

              {formError && (
                <div className="p-2.5 rounded-lg bg-error-container text-on-error-container text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  <span>{formError}</span>
                </div>
              )}

              {/* Name & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-on-surface mb-1">
                    Category Name <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Groceries, Dairy, Tools"
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (formError) setFormError('');
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1">
                    Short Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Daily grocery provisions"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              {/* Color & Icon Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Color Picker Swatches */}
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">
                    Theme Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {CATEGORY_COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormColor(color)}
                        className={`w-6 h-6 rounded-full transition-transform cursor-pointer relative ${
                          formColor === color ? 'scale-125 ring-2 ring-offset-2 ring-secondary' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Icon Selector */}
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">
                    Category Icon
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap max-h-24 overflow-y-auto p-1 bg-surface-container-lowest rounded-xl border border-outline-variant/30">
                    {CATEGORY_ICON_OPTIONS.map((item) => (
                      <button
                        key={item.icon}
                        type="button"
                        onClick={() => setFormIcon(item.icon)}
                        title={item.label}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                          formIcon === item.icon
                            ? 'bg-secondary text-on-secondary shadow-sm'
                            : 'text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Default Tax & HSN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1">
                    Default GST Rate (Optional)
                  </label>
                  <select
                    value={formGstRate}
                    onChange={(e) => setFormGstRate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface focus:outline-none focus:border-secondary"
                  >
                    <option value="NONE">No Default (Item Decides)</option>
                    <option value="0">0% (Nil / Exempt)</option>
                    <option value="5">5% Standard</option>
                    <option value="12">12% Standard</option>
                    <option value="18">18% Standard</option>
                    <option value="28">28% Highest</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1">
                    Default HSN/SAC (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1006 or 8517"
                    value={formHsn}
                    onChange={(e) => setFormHsn(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>
              </div>

              {/* Live Preview Chip */}
              <div className="pt-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-on-surface-variant font-medium">Badge Preview:</span>
                  <span
                    className="px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm"
                    style={{
                      backgroundColor: `${formColor}20`,
                      color: formColor,
                      border: `1px solid ${formColor}40`,
                    }}
                  >
                    <span className="material-symbols-outlined text-[16px]">{formIcon}</span>
                    <span>{formName.trim() || 'Preview'}</span>
                    {formGstRate !== 'NONE' && (
                      <span className="text-[10px] opacity-80 font-mono">({formGstRate}%)</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancelForm}
                    className="px-3 py-1.5 text-xs rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-bold rounded-xl bg-secondary text-on-secondary shadow-sm hover:opacity-90 transition-all cursor-pointer"
                  >
                    {isCreating ? 'Save Category' : 'Update Category'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Categories Grid List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredCategories.map((cat) => {
              const count = itemCounts[cat.name] || 0;
              const catColor = cat.color || '#64748b';
              const catIcon = cat.icon || 'category';

              return (
                <div
                  key={cat.id}
                  className="bg-surface-container-lowest rounded-2xl p-3.5 border border-outline-variant/25 hover:border-outline-variant/60 shadow-sm flex flex-col justify-between gap-2.5 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                        style={{
                          backgroundColor: `${catColor}20`,
                          color: catColor,
                        }}
                      >
                        <span className="material-symbols-outlined text-[20px]">{catIcon}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                            {cat.name}
                          </span>
                          {cat.isSystem && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-surface-container-high text-on-surface-variant">
                              Default
                            </span>
                          )}
                        </div>
                        {cat.description && (
                          <p className="text-[11px] text-on-surface-variant truncate max-w-[200px]">
                            {cat.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-90 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(cat)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
                        title="Edit category"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                      {!cat.isSystem && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingCat(cat);
                            setReassignTarget('General');
                          }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-error hover:bg-error-container/30 transition-colors cursor-pointer"
                          title="Delete category"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Metadata Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/15 text-[11px]">
                    <div className="flex items-center gap-2 text-on-surface-variant">
                      {cat.defaultGstRate !== undefined && (
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-[10px] font-mono font-semibold">
                          GST {cat.defaultGstRate}%
                        </span>
                      )}
                      {cat.defaultHsn && (
                        <span className="text-[10px] text-outline font-mono">
                          HSN: {cat.defaultHsn}
                        </span>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        count > 0
                          ? 'bg-secondary/15 text-secondary'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {count} {count === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredCategories.length === 0 && (
            <div className="p-8 text-center bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/40">
              <span className="material-symbols-outlined text-[36px] text-on-surface-variant mb-2">
                category
              </span>
              <p className="text-xs text-on-surface-variant font-medium">
                No categories match "{searchQuery}"
              </p>
              <button
                type="button"
                onClick={handleStartCreate}
                className="mt-3 px-3 py-1.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold inline-flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Create "{searchQuery}"
              </button>
            </div>
          )}
        </div>

        {/* Delete Confirmation Sub-Dialog */}
        {deletingCat && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-surface rounded-2xl p-5 max-w-md w-full shadow-2xl border border-outline-variant/30 flex flex-col gap-3.5 animate-scale-up">
              <div className="flex items-center gap-3 text-error">
                <div className="w-10 h-10 rounded-xl bg-error/15 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[22px]">delete</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-on-surface">Delete Category?</h3>
                  <p className="text-xs text-on-surface-variant">
                    Are you sure you want to delete "{deletingCat.name}"?
                  </p>
                </div>
              </div>

              {itemCounts[deletingCat.name] > 0 ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                  <strong>Notice:</strong> This category is assigned to{' '}
                  <strong>{itemCounts[deletingCat.name]} item(s)</strong>. They will be reassigned to:
                  <div className="mt-2">
                    <select
                      value={reassignTarget}
                      onChange={(e) => setReassignTarget(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-outline-variant/30 text-xs font-bold text-on-surface focus:outline-none"
                    >
                      {categories
                        .filter((c) => c.id !== deletingCat.id)
                        .map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  No items currently belong to this category. It will be removed permanently.
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setDeletingCat(null)}
                  className="px-3.5 py-1.5 rounded-xl text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-4 py-1.5 rounded-xl bg-error text-on-error text-xs font-bold shadow-sm hover:opacity-90 transition-all cursor-pointer"
                >
                  Delete Category
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-outline-variant/20 bg-surface-container-low/50 flex items-center justify-between text-xs text-on-surface-variant">
          <span>{categories.length} total categories registered</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-container-highest text-on-surface font-bold hover:bg-outline-variant/20 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={showResetConfirm}
        title="Reset Categories to Defaults?"
        description="Are you sure you want to reset categories to default industry presets? Custom categories will be refreshed."
        confirmText="Reset Presets"
        cancelText="Cancel"
        onConfirm={handleConfirmReset}
        onClose={() => setShowResetConfirm(false)}
      />
    </div>
  );
};
