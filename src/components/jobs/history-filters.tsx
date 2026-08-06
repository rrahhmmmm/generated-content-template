import Link from "next/link";
import { Button } from "@/components/ui/button";

export type HistoryFiltersProps = {
  groups: { id: string; name: string }[];
  filters: {
    group?: string;
    from?: string;
    to?: string;
  };
};

export function HistoryFilters({ groups, filters }: HistoryFiltersProps) {
  const hasActiveFilter = Boolean(filters.group || filters.from || filters.to);
  const formKey = `${filters.group ?? ""}|${filters.from ?? ""}|${filters.to ?? ""}`;

  const controlClass =
    "flex h-10 rounded-md border border-border bg-surface px-3 text-body text-text focus:outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <form
      key={formKey}
      method="get"
      action="/jobs"
      className="flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-label text-text-muted">Grup</span>
        <select
          name="group"
          defaultValue={filters.group ?? ""}
          className={`${controlClass} min-w-[10rem]`}
        >
          <option value="">Semua grup</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-label text-text-muted">Dari tanggal</span>
        <input
          type="date"
          name="from"
          defaultValue={filters.from ?? ""}
          className={controlClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-label text-text-muted">Sampai tanggal</span>
        <input
          type="date"
          name="to"
          defaultValue={filters.to ?? ""}
          className={controlClass}
        />
      </label>

      <div className="flex gap-2">
        <Button type="submit" size="md">
          Terapkan
        </Button>
        {hasActiveFilter ? (
          <Button variant="ghost" size="md" asChild>
            <Link href="/jobs">Reset</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
