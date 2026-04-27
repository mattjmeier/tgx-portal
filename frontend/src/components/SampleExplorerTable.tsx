import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Download, SlidersHorizontal, Tags } from "lucide-react";

import type { Sample } from "../api/samples";
import { cn } from "../lib/utils";
import { WorkspaceSectionCard } from "./WorkspaceSectionCard";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

export type SampleExplorerFilters = {
  group?: string;
  dose?: string;
  chemical?: string;
  controlFlag?: "technical_control" | "reference_rna" | "solvent_control" | "any";
  assayStatus?: "present" | "missing";
  missingMetadata?: string;
};

type SampleExplorerTableProps = {
  samples: Sample[];
  totalCount: number;
  isLoading: boolean;
  pagination: PaginationState;
  sorting: SortingState;
  search: string;
  selectedSampleId: number | null;
  selectedSampleIds: Set<number>;
  filters: SampleExplorerFilters;
  metadataColumns: string[];
  onPaginationChange: (pagination: PaginationState) => void;
  onSortingChange: (sorting: SortingState) => void;
  onSearchChange: (search: string) => void;
  onFilterChange: (filters: SampleExplorerFilters) => void;
  onClearFilters: () => void;
  onSelectSample: (sample: Sample) => void;
  onToggleSampleSelection: (sampleId: number, selected: boolean) => void;
  onTogglePageSelection: (selected: boolean, sampleIds: number[]) => void;
};

const metadataColumnOptions = ["group", "dose", "chemical"];

function getMetadataValue(sample: Sample, key: string): string {
  const value = sample.metadata?.[key];
  if (value === undefined || value === null || value === "") {
    return "—";
  }
  return String(value);
}

function labelForFilter(key: keyof SampleExplorerFilters, value: string): string {
  if (key === "assayStatus") {
    return value === "missing" ? "Missing processing metadata" : "Has processing metadata";
  }
  if (key === "controlFlag") {
    const labels: Record<string, string> = {
      any: "Any control",
      reference_rna: "Reference RNA",
      solvent_control: "Solvent control",
      technical_control: "Technical control",
    };
    return labels[value] ?? value;
  }
  if (key === "missingMetadata") {
    return `Missing ${value}`;
  }
  return `${key}: ${value}`;
}

export function SampleExplorerTable({
  samples,
  totalCount,
  isLoading,
  pagination,
  sorting,
  search,
  selectedSampleId,
  selectedSampleIds,
  filters,
  metadataColumns,
  onPaginationChange,
  onSortingChange,
  onSearchChange,
  onFilterChange,
  onClearFilters,
  onSelectSample,
  onToggleSampleSelection,
  onTogglePageSelection,
}: SampleExplorerTableProps) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize));
  const firstRow = totalCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const lastRow = Math.min(totalCount, (pagination.pageIndex + 1) * pagination.pageSize);
  const selectedOnPage = samples.filter((sample) => selectedSampleIds.has(sample.id));
  const allPageSelected = samples.length > 0 && selectedOnPage.length === samples.length;
  const somePageSelected = selectedOnPage.length > 0 && selectedOnPage.length < samples.length;
  const availableMetadataColumns = metadataColumns.length ? metadataColumns : metadataColumnOptions;
  const activeFilters = Object.entries(filters).filter((entry): entry is [keyof SampleExplorerFilters, string] =>
    typeof entry[1] === "string" && entry[1].trim().length > 0,
  );

  const columns = useMemo<ColumnDef<Sample>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <Checkbox
            aria-label="Select all samples on this page"
            checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
            onCheckedChange={(checked) => onTogglePageSelection(checked === true, samples.map((sample) => sample.id))}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select sample ${row.original.sample_ID}`}
            checked={selectedSampleIds.has(row.original.id)}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(checked) => onToggleSampleSelection(row.original.id, checked === true)}
          />
        ),
        enableSorting: false,
      },
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
        id: "group",
        header: "Group",
        cell: ({ row }) => getMetadataValue(row.original, "group"),
      },
      {
        id: "dose",
        header: "Dose",
        cell: ({ row }) => getMetadataValue(row.original, "dose"),
      },
      {
        id: "chemical",
        header: "Chemical",
        cell: ({ row }) => getMetadataValue(row.original, "chemical"),
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
    ],
    [allPageSelected, onTogglePageSelection, onToggleSampleSelection, samples, selectedSampleIds, somePageSelected],
  );

  const table = useReactTable({
    data: samples,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: totalCount,
    state: {
      columnVisibility,
      pagination,
      sorting,
    },
    onColumnVisibilityChange: setColumnVisibility,
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
    <WorkspaceSectionCard
      contentClassName="flex flex-col gap-5"
      description="Select a sample row to open full metadata and processing details."
      eyebrow="Explorer"
      title="Sample explorer"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={selectedSampleIds.size === 0} size="sm" type="button" variant="outline">
            <Download data-icon="inline-start" />
            Export selected
          </Button>
          <Button disabled={selectedSampleIds.size === 0} size="sm" type="button" variant="outline">
            <Tags data-icon="inline-start" />
            Labels
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_160px_170px_170px_auto] xl:items-end">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="sample-search">Search</Label>
          <Input
            id="sample-search"
            placeholder="Search sample ID, name, group, or chemical"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="assay-status-filter">Processing metadata</Label>
          <Select
            value={filters.assayStatus ?? "__all__"}
            onValueChange={(value) => onFilterChange({ ...filters, assayStatus: value === "__all__" ? undefined : value as "present" | "missing" })}
          >
            <SelectTrigger id="assay-status-filter" aria-label="Processing metadata status">
              <SelectValue placeholder="All metadata" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All metadata states</SelectItem>
              <SelectItem value="present">Has processing metadata</SelectItem>
              <SelectItem value="missing">Missing processing metadata</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="control-filter">Controls</Label>
          <Select
            value={filters.controlFlag ?? "__all__"}
            onValueChange={(value) => onFilterChange({ ...filters, controlFlag: value === "__all__" ? undefined : value as SampleExplorerFilters["controlFlag"] })}
          >
            <SelectTrigger id="control-filter" aria-label="Control filter">
              <SelectValue placeholder="All samples" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All samples</SelectItem>
              <SelectItem value="any">Any control</SelectItem>
              <SelectItem value="solvent_control">Solvent control</SelectItem>
              <SelectItem value="reference_rna">Reference RNA</SelectItem>
              <SelectItem value="technical_control">Technical control</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="missing-metadata-filter">Missing metadata</Label>
          <Select
            value={filters.missingMetadata ?? "__none__"}
            onValueChange={(value) => onFilterChange({ ...filters, missingMetadata: value === "__none__" ? undefined : value })}
          >
            <SelectTrigger id="missing-metadata-filter" aria-label="Missing metadata">
              <SelectValue placeholder="No filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No filter</SelectItem>
              {availableMetadataColumns.map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline">
              <SlidersHorizontal data-icon="inline-start" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {table
                .getAllLeafColumns()
                .filter((column) => column.id !== "select")
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => column.toggleVisibility(checked)}
                  >
                    {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map(([key, value]) => (
            <Badge key={key} variant="secondary">
              {labelForFilter(key, value)}
            </Badge>
          ))}
          <Button size="sm" type="button" variant="ghost" onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          {totalCount} sample record{totalCount === 1 ? "" : "s"} in this study
          {selectedSampleIds.size > 0 ? ` · ${selectedSampleIds.size} selected` : ""}
        </p>
        <p>
          Showing {firstRow}-{lastRow} of {totalCount}
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className="hover:bg-transparent" key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortState = header.column.getIsSorted();
                  return (
                    <TableHead className="text-foreground" key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          className="inline-flex items-center gap-2 text-left hover:text-foreground"
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="text-xs text-muted-foreground">{sortState === "asc" ? "↑" : sortState === "desc" ? "↓" : "↕"}</span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={columns.length}>Loading samples...</TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={columns.length}>No samples match the current view.</TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  className={cn(
                    "cursor-pointer",
                    row.original.id === selectedSampleId ? "bg-muted hover:bg-muted" : "hover:bg-muted/40",
                  )}
                  data-state={row.original.id === selectedSampleId ? "selected" : undefined}
                  key={row.id}
                  onClick={() => onSelectSample(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          disabled={pagination.pageIndex === 0}
          type="button"
          variant="outline"
          onClick={() => table.previousPage()}
        >
          <ChevronLeft data-icon="inline-start" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {pagination.pageIndex + 1} of {pageCount}
        </span>
        <Button
          disabled={pagination.pageIndex + 1 >= pageCount}
          type="button"
          variant="outline"
          onClick={() => table.nextPage()}
        >
          Next
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </WorkspaceSectionCard>
  );
}
