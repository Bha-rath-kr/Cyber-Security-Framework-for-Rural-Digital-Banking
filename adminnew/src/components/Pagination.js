import { useMemo } from "react";

const perPageOptions = [10, 25, 50, 100];

const pageNumbers = (page, totalPages) => {
  const pages = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else if (page <= 3) {
    pages.push(1, 2, 3, 4, "...", totalPages);
  } else if (page >= totalPages - 2) {
    pages.push(1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
  } else {
    pages.push(1, "...", page - 1, page, page + 1, "...", totalPages);
  }
  return pages;
};

export default function Pagination({ page, perPage, total, totalPages, onPageChange, onPerPageChange }) {
  const pages = useMemo(() => pageNumbers(page, totalPages), [page, totalPages]);

  if (totalPages <= 0) return null;

  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">
          Showing {start}–{end} of {total}
        </span>
        <select
          value={perPage}
          onChange={e => { onPerPageChange(Number(e.target.value)); }}
          className="px-2 py-1.5 rounded-lg border bg-transparent text-sm"
        >
          {perPageOptions.map(n => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-3 py-1.5 border rounded-lg disabled:opacity-50 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Prev
          </button>
          {pages.map((p, i) =>
            p === "..." ? (
              <span key={`e${i}`} className="px-1 text-muted text-sm">...</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`px-3 py-1.5 border rounded-lg text-sm ${
                  page === p
                    ? "bg-green-600 text-white border-green-600"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="px-3 py-1.5 border rounded-lg disabled:opacity-50 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
