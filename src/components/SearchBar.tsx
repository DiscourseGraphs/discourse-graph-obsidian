import { AbstractInputSuggest, App } from "obsidian";
import { useEffect, useRef, useState, useCallback } from "react";
import { usePlugin } from "./PluginContext";

class GenericSuggest<T> extends AbstractInputSuggest<T> {
  private getItemTextFn: (item: T) => string;
  private renderItemFn: (item: T, el: HTMLElement) => void;
  private onSelectCallback: (item: T) => void;
  private asyncSearchFn: (query: string) => Promise<T[]>;
  private minQueryLength: number;
  private debounceTimeout: number | null = null;

  constructor(
    app: App,
    private textInputEl: HTMLInputElement,
    onSelectCallback: (item: T) => void,
    config: {
      getItemText: (item: T) => string;
      renderItem?: (item: T, el: HTMLElement) => void;
      asyncSearch: (query: string) => Promise<T[]>;
      minQueryLength?: number;
    },
  ) {
    super(app, textInputEl);
    this.onSelectCallback = onSelectCallback;
    this.getItemTextFn = config.getItemText;
    this.renderItemFn = config.renderItem || this.defaultRenderItem.bind(this);
    this.asyncSearchFn = config.asyncSearch;
    this.minQueryLength = config.minQueryLength || 0;
  }

  async getSuggestions(inputStr: string): Promise<T[]> {
    const query = inputStr.trim();
    if (query.length < this.minQueryLength) {
      return [];
    }

    return new Promise((resolve) => {
      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout);
      }

      this.debounceTimeout = window.setTimeout(async () => {
        try {
          const results = await this.asyncSearchFn(query);
          resolve(results);
        } catch (error) {
          console.error(`[GenericSuggest] Error in async search:`, error);
          resolve([]);
        }
      }, 250);
    });
  }

  private defaultRenderItem(item: T, el: HTMLElement): void {
    el.setText(this.getItemTextFn(item));
  }

  renderSuggestion(item: T, el: HTMLElement): void {
    this.renderItemFn(item, el);
  }

  selectSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void {
    this.textInputEl.value = this.getItemTextFn(item);
    this.onSelectCallback(item);
    this.close();
  }
}

const SearchBar = <T,>({
  onSelect,
  placeholder,
  getItemText,
  renderItem,
  asyncSearch,
  disabled = false,
}: {
  onSelect: (item: T | null) => void;
  placeholder?: string;
  getItemText: (item: T) => string;
  renderItem?: (item: T, el: HTMLElement) => void;
  asyncSearch: (query: string) => Promise<T[]>;
  disabled?: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<T | null>(null);
  const plugin = usePlugin();
  const app = plugin.app;

  useEffect(() => {
    if (inputRef.current && app) {
      const suggest = new GenericSuggest(
        app,
        inputRef.current,
        (item) => {
          setSelected(item);
          onSelect(item);
        },
        {
          getItemText,
          renderItem,
          asyncSearch,
        },
      );
      return () => suggest.close();
    }
  }, [onSelect, app, getItemText, renderItem, asyncSearch]);

  const clearSelection = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = "";
      setSelected(null);
      onSelect(null);
    }
  }, [onSelect]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder || "Search..."}
        className={`w-full p-2 ${
          selected ? "pr-9" : ""
        } border-modifier-border rounded border bg-${
          selected || disabled ? "secondary" : "primary"
        } ${disabled ? "cursor-not-allowed opacity-70" : "cursor-text"}`}
        readOnly={!!selected || disabled}
        disabled={disabled}
      />
      {selected && !disabled && (
        <button
          onClick={clearSelection}
          className="text-muted absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer rounded border-0 bg-transparent p-1"
          aria-label="Clear selection"
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default SearchBar;
