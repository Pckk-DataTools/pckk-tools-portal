import type { ToolFilters } from "./types";

type ToolSearchFiltersProps = {
  filters: ToolFilters;
  categories: string[];
  onChange: (next: ToolFilters) => void;
  onReset: () => void;
};

export function ToolSearchFilters({ filters, categories, onChange, onReset }: ToolSearchFiltersProps) {
  return (
    <section className="panel filters-panel">
      <div className="filters-grid">
        <input
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder="ツール名、概要、カテゴリで検索"
        />
        <select
          value={filters.category}
          onChange={(event) => onChange({ ...filters, category: event.target.value })}
        >
          <option value="all">カテゴリ: すべて</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="filters-checks">
        <label>
          <input
            type="checkbox"
            checked={filters.latestOnly}
            onChange={(event) => onChange({ ...filters, latestOnly: event.target.checked })}
          />
          最新版のみ表示
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.hasDocument}
            onChange={(event) => onChange({ ...filters, hasDocument: event.target.checked })}
          />
          ドキュメントあり
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.hasInstaller}
            onChange={(event) => onChange({ ...filters, hasInstaller: event.target.checked })}
          />
          インストーラーあり
        </label>
        <button className="button-ghost" onClick={onReset}>
          フィルターリセット
        </button>
      </div>
    </section>
  );
}
