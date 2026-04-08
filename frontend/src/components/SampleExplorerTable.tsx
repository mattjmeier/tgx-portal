import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { Sample } from "../api/samples";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type SampleExplorerTableProps = {
  samples: Sample[];
  totalCount: number;
  isLoading: boolean;
  pagination: PaginationState;
  sorting: SortingState;
  search: string;
  selectedSampleId: number | null;
  onPaginationChange: (pagination: PaginationState) => void;
  onSortingChange: (sorting: SortingState) => void;
  onSearchChange: (search: string) => void;
  onSelectSample: (sample: Sample) => void;
};

const columns: ColumnDef<Sample>[] = [
  {
    accessorKey: "sample_ID",
    header: "Sample ID",
    cell: (info) => info.getValue(),
  },
  {
    accessorKey: "sample_name",
    header: "Sample name",
    cell: (info) => info.getValue(),
  },
  {
    accessorKey: "group",
    header: "Group",
    cell: (info) => info.getValue(),
  },
  {
    accessorKey: "dose",
    header: "Dose",
    cell: (info) => info.getValue(),
  },
  {
    id: "controls",
    header: "Controls",
    cell: ({ row }) => {
      const sample = row.original;
      const flags = [
        sample.technical_control ? "Technical" : null,
        sample.reference_rna ? "Reference RNA" : null,
        sample.solvent_control ? "Solvent" : null,
      ].filter(Boolean);
      return flags.length > 0 ? flags.join(", ") : "None";
    },
  },
];

export function SampleExplorerTable({
  samples,
  totalCount,
  isLoading,
  pagination,
  sorting,
  search,
  selectedSampleId,
  onPaginationChange,
  onSortingChange,
  onSearchChange,
  onSelectSample,
}: SampleExplorerTableProps) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize));
  const firstRow = totalCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const lastRow = Math.min(totalCount, (pagination.pageIndex + 1) * pagination.pageSize);

  const table = useReactTable({
    data: samples,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: totalCount,
    state: {
      pagination,
      sorting,
    },
    onPaginationChange: (updater) => {
      const nextPagination = typeof updater === "function" ? updater(pagination) : updater;
      onPaginationChange(nextPagination);
    },
    onSortingChange: (updater) => {
      const nextSorting = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(nextSorting);
    },
  });

  return (
    <section className="workspace-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Explorer</p>
          <h2>Sample explorer</h2>
        </div>
      </div>

      <div className="explorer-toolbar">
        <div className="explorer-search">
          <Label htmlFor="sample-search">Search</Label>
          <Input
            id="sample-search"
            placeholder="Search sample ID, name, group, or chemical"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className="explorer-page-size">
          <Label htmlFor="sample-page-size">Rows per page</Label>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(value) =>
              onPaginationChange({
                pageIndex: 0,
                pageSize: Number(value),
              })
            }
          >
            <SelectTrigger id="sample-page-size" aria-label="Rows per page" className="w-[140px]">
              <SelectValue placeholder="Rows per page" />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 50].map((pageSizeOption) => (
                <SelectItem key={pageSizeOption} value={String(pageSizeOption)}>
                  {pageSizeOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="explorer-meta-row">
        <p className="muted-copy">
          {totalCount} sample record{totalCount === 1 ? "" : "s"} in this study
        </p>
        <p className="muted-copy">
          Showing {firstRow}-{lastRow} of {totalCount}
        </p>
      </div>

      <div className="table-shell">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortState = header.column.getIsSorted();
                  return (
                    <th key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button className="table-sort-button" type="button" onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span>{sortState === "asc" ? "↑" : sortState === "desc" ? "↓" : "↕"}</span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length}>Loading samples...</td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>No samples match the current view.</td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  className={row.original.id === selectedSampleId ? "data-row-selected" : ""}
                  key={row.id}
                  onClick={() => onSelectSample(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="explorer-pagination">
        <Button
          disabled={pagination.pageIndex === 0}
          type="button"
          variant="outline"
          onClick={() => table.previousPage()}
        >
          <ChevronLeft />
          Previous
        </Button>
        <span className="muted-copy">
          Page {pagination.pageIndex + 1} of {pageCount}
        </span>
        <Button
          disabled={pagination.pageIndex + 1 >= pageCount}
          type="button"
          variant="outline"
          onClick={() => table.nextPage()}
        >
          Next
          <ChevronRight />
        </Button>
      </div>
    </section>
  );
}
