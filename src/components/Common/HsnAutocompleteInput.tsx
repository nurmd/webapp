import React, { useState, useEffect, useRef, useId } from 'react';
import type { HsnItem } from '../../core/gst/hsnCatalog';
import { db } from '../../services/db.ts';

export type { HsnItem };

export interface HsnAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectHsn?: (item: HsnItem) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  required?: boolean;
  id?: string;
  'aria-label'?: string;
  isGstEnabled?: boolean;
}

// Module-level cache so dynamic import executes only once across the application lifecycle
let hsnCatalogPromise: Promise<typeof import('../../core/gst/hsnCatalog')> | null = null;
let cachedSearchHsn: ((query: string, limit?: number) => HsnItem[]) | null = null;

export function loadHsnCatalog(): Promise<(query: string, limit?: number) => HsnItem[]> {
  if (cachedSearchHsn) {
    return Promise.resolve(cachedSearchHsn);
  }
  if (!hsnCatalogPromise) {
    hsnCatalogPromise = import('../../core/gst/hsnCatalog');
  }
  return hsnCatalogPromise.then((mod) => {
    cachedSearchHsn = mod.searchHsn;
    return mod.searchHsn;
  });
}

export const HsnAutocompleteInput: React.FC<HsnAutocompleteInputProps> = ({
  value,
  onChange,
  onSelectHsn,
  placeholder = 'Search code or name (e.g. 8471 or Laptop)',
  className = '',
  disabled = false,
  autoFocus = false,
  required = false,
  id,
  'aria-label': ariaLabel = 'HSN or SAC Code',
  isGstEnabled,
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const containerRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<HsnItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [dropdownAlign, setDropdownAlign] = useState<'left' | 'right'>('left');

  // Determine if GST is active: prop takes precedence, fallback to db.getCompany().isGstEnabled !== false
  const activeGst = isGstEnabled ?? (typeof db?.getCompany === 'function' ? (db.getCompany()?.isGstEnabled !== false) : true);

  // Dynamically calculate whether dropdown should anchor left or right based on viewport bounds
  useEffect(() => {
    if (!activeGst) return;
    if (isOpen && containerRef.current && typeof window !== 'undefined') {
      const rect = containerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 360;
      if (rect.right + 120 > viewportWidth || rect.left > viewportWidth / 2) {
        setDropdownAlign('right');
      } else {
        setDropdownAlign('left');
      }
    }
  }, [isOpen, activeGst]);

  // Update suggestions whenever value changes or dropdown opens
  useEffect(() => {
    if (!activeGst) {
      return;
    }
    if (!isOpen && !cachedSearchHsn) {
      return;
    }

    let isSubscribed = true;

    if (cachedSearchHsn) {
      setSuggestions(cachedSearchHsn(value, 15));
      setSelectedIndex(-1);
    } else {
      loadHsnCatalog()
        .then((searchFn) => {
          if (isSubscribed) {
            setSuggestions(searchFn(value, 15));
            setSelectedIndex(-1);
          }
        })
        .catch((err) => {
          console.error('Failed to load HSN catalog:', err);
          if (isSubscribed) {
            setSuggestions([]);
          }
        });
    }

    return () => {
      isSubscribed = false;
    };
  }, [value, isOpen, activeGst]);

  // Handle outside clicks to close dropdown (both mouse click and mobile touch)
  useEffect(() => {
    if (!activeGst) return;
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [activeGst]);

  // If GST is disabled, do not render any DOM elements
  if (!activeGst) {
    return null;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    onChange(newVal);
    if (!isOpen) {
      setIsOpen(true);
    }
    if (cachedSearchHsn) {
      setSuggestions(cachedSearchHsn(newVal, 15));
      setSelectedIndex(-1);
    } else {
      loadHsnCatalog()
        .then((searchFn) => {
          setSuggestions(searchFn(newVal, 15));
          setSelectedIndex(-1);
        })
        .catch(() => {
          setSuggestions([]);
        });
    }
  };

  const handleSelect = (item: HsnItem) => {
    onChange(item.code);
    if (onSelectHsn) {
      onSelectHsn(item);
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      if (cachedSearchHsn) {
        setSuggestions(cachedSearchHsn(value, 15));
      } else {
        loadHsnCatalog()
          .then((searchFn) => {
            setSuggestions(searchFn(value, 15));
          })
          .catch(() => {
            setSuggestions([]);
          });
      }
      return;
    }

    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      const idx = selectedIndex >= 0 ? selectedIndex : 0;
      if (idx < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[idx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => {
          setIsOpen(true);
          if (cachedSearchHsn) {
            setSuggestions(cachedSearchHsn(value, 15));
          } else {
            loadHsnCatalog()
              .then((searchFn) => {
                setSuggestions(searchFn(value, 15));
              })
              .catch(() => {
                setSuggestions([]);
              });
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={`${inputId}-listbox`}
        role="combobox"
        autoComplete="off"
        className={
          className ||
          'w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-on-surface text-xs font-mono focus:outline-none focus:border-secondary'
        }
      />

      {isOpen && suggestions.length > 0 && (
        <ul
          id={`${inputId}-listbox`}
          role="listbox"
          className={`absolute z-50 ${
            dropdownAlign === 'right' ? 'right-0' : 'left-0'
          } min-w-[260px] sm:min-w-[340px] max-w-[calc(100vw-1.5rem)] mt-1 max-h-60 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl py-1 text-xs`}
        >
          {suggestions.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <li
                key={`${item.code}-${idx}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => handleSelect(item)}
                className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 border-b border-outline-variant/10 last:border-b-0 transition-colors ${
                  isSelected
                    ? 'bg-secondary/10 text-on-surface font-semibold'
                    : 'text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-secondary text-xs">
                      {item.code}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold tracking-wider ${
                        item.category === 'Services'
                          ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {item.category === 'Services' ? 'SAC' : 'HSN'}
                    </span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant truncate max-w-[280px] sm:max-w-sm">
                    {item.description}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <span className="px-1.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-mono font-black text-[10px]">
                    {item.gstRate}% GST
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
