import { useEffect, useId, useRef, useState } from 'react';
import { Close, SearchIcon } from './icons.js';
import { Input } from './ui/input.js';

export interface SearchInputProps {
  /** Visible label (already translated). */
  label: string;
  /** The current search (e.g. from the URL). Changing it from outside replaces the text. */
  value: string;
  /** Called with the trimmed text after `delayMs` without typing, at once on Enter or clear. */
  onSearch: (value: string) => void;
  delayMs?: number;
  placeholder?: string;
  clearLabel: string;
  id?: string;
}

/** A search box that reports what was typed after a short pause (debounced). */
export function SearchInput({
  label,
  value,
  onSearch,
  delayMs = 300,
  placeholder,
  clearLabel,
  id,
}: SearchInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [text, setText] = useState(value);
  // A new value from outside (e.g. "Clear search" elsewhere, Back) replaces what is typed
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }

  // The latest callback, without restarting the timer when the parent re-renders
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === value) return;
    const timer = setTimeout(() => onSearchRef.current(trimmed), delayMs);
    return () => clearTimeout(timer);
  }, [text, value, delayMs]);

  const searchNow = (next: string) => {
    setText(next);
    if (next.trim() !== value) onSearchRef.current(next.trim());
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={inputId}
          type="search"
          className="pl-9 pr-10"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              searchNow(text);
            }
          }}
        />
        {text ? (
          <button
            type="button"
            aria-label={clearLabel}
            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => searchNow('')}
          >
            <Close className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
