import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Database, Layers3, Search, SlidersHorizontal } from "lucide-react";

import { fetchReferenceLibrary, type ProfilingPlatformSummary, type ReferenceLibraryResponse } from "../api/referenceLibrary";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Separator } from "../components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { Skeleton } from "../components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

function lookupValueLabel(value: string | { label: string; value: string }): string {
  return typeof value === "string" ? value : value.label;
}

function lookupValueRaw(value: string | { label: string; value: string }): string {
  return typeof value === "string" ? value : value.value;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function platformMatches(platform: ProfilingPlatformSummary, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [
    platform.platform_name,
    platform.title,
    platform.description,
    platform.technology_type,
    platform.study_type,
    platform.species_label,
    platform.version,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

function lookupMatches(category: string, bucket: ReferenceLibraryResponse["controlled_lookups"][string], query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [category, bucket.label, ...bucket.values.map(lookupValueLabel), ...bucket.values.map(lookupValueRaw)]
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton className="h-32 rounded-xl" key={item} />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

function PlatformDetailsSheet({
  platform,
  onOpenChange,
}: {
  platform: ProfilingPlatformSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={platform !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{platform?.platform_name ?? "Platform details"}</SheetTitle>
          <SheetDescription>{platform?.title}</SheetDescription>
        </SheetHeader>

        {platform ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{platform.technology_type}</Badge>
              <Badge variant="outline">{platform.study_type}</Badge>
              {platform.species_label ? <Badge variant="outline">{platform.species_label}</Badge> : null}
            </div>

            <div className="grid gap-3 text-sm">
              <div>
                <p className="font-medium">App boundary</p>
                <p className="text-muted-foreground">profiling.ProfilingPlatform</p>
              </div>
              <div>
                <p className="font-medium">Description</p>
                <p className="text-muted-foreground">{platform.description || "No description provided."}</p>
              </div>
              <div>
                <p className="font-medium">Version</p>
                <p className="text-muted-foreground">{platform.version || "Not versioned"}</p>
              </div>
              <div>
                <p className="font-medium">Linked warehouse studies</p>
                <p className="text-muted-foreground">{platform.study_count}</p>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <p className="font-medium">Extended attributes</p>
              <pre className="overflow-auto rounded-lg border bg-muted p-3 text-xs text-muted-foreground">
                {JSON.stringify(platform.ext, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function ReferenceLibraryPage() {
  const [query, setQuery] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<ProfilingPlatformSummary | null>(null);
  const referenceQuery = useQuery({
    queryKey: ["reference-library"],
    queryFn: fetchReferenceLibrary,
  });

  const data = referenceQuery.data;
  const filteredPlatforms = data?.profiling_platforms.filter((platform) => platformMatches(platform, query)) ?? [];
  const filteredLookupEntries = Object.entries(data?.controlled_lookups ?? {}).filter(([category, bucket]) =>
    lookupMatches(category, bucket, query),
  );

  return (
    <section className="workspace-route">
      <div className="section-header">
        <div>
          <p className="eyebrow">Reference library</p>
          <h2>Shared taxonomy</h2>
          <p className="muted-copy">
            Compare operational intake choices with canonical warehouse platform definitions.
          </p>
        </div>
      </div>

      {referenceQuery.isLoading ? <LoadingState /> : null}

      {referenceQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Reference library unavailable</CardTitle>
            <CardDescription>{referenceQuery.error.message}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {data ? (
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Species" value={data.summary.species_count} detail="Study-level choices shared across intake and warehouse metadata." />
            <SummaryCard label="Technologies" value={data.summary.technology_type_count} detail="Technology families represented by canonical profiling platforms." />
            <SummaryCard label="Platforms" value={data.summary.profiling_platform_count} detail="Reusable UL-aligned platform and feature-set records." />
            <SummaryCard label="Lookup values" value={data.summary.controlled_lookup_count} detail="Admin-managed onboarding and config dropdown values." />
          </div>

          {data.drift_warnings.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle />
                  <CardTitle className="text-lg">{pluralize(data.summary.drift_warning_count, "drift warning")}</CardTitle>
                </div>
                <CardDescription>
                  These values exist in operational lookup lists but do not currently map to canonical platform technology types.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.drift_warnings.map((warning) => (
                  <Badge key={`${warning.category}:${warning.value}`} variant="outline">
                    {warning.category}: {warning.value}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>Reference console</CardTitle>
                  <CardDescription>
                    Search across canonical platforms, operational lookup buckets, and hierarchy terminology.
                  </CardDescription>
                </div>
                <div className="relative w-full lg:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    aria-label="Search reference library"
                    className="pl-9"
                    placeholder="Search platform, species, lookup..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="platforms">
                <TabsList>
                  <TabsTrigger value="platforms">Canonical platforms</TabsTrigger>
                  <TabsTrigger value="lookups">Operational lookups</TabsTrigger>
                  <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
                </TabsList>

                <TabsContent value="platforms">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                      {data.technology_types.map((technology) => (
                        <Badge key={technology.value} variant="secondary">
                          {technology.label} · {technology.platform_count}
                        </Badge>
                      ))}
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Platform</TableHead>
                          <TableHead>Technology</TableHead>
                          <TableHead>Species</TableHead>
                          <TableHead>Version</TableHead>
                          <TableHead>Studies</TableHead>
                          <TableHead className="text-right">Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPlatforms.map((platform) => (
                          <TableRow key={platform.id}>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">{platform.platform_name}</span>
                                <span className="text-muted-foreground">{platform.title}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{platform.technology_type}</Badge>
                            </TableCell>
                            <TableCell>{platform.species_label ?? "Not species-specific"}</TableCell>
                            <TableCell>{platform.version || "—"}</TableCell>
                            <TableCell>{platform.study_count}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                aria-label={`View ${platform.platform_name} details`}
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedPlatform(platform)}
                              >
                                <Database data-icon="inline-start" />
                                Inspect
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredPlatforms.length === 0 ? (
                          <TableRow>
                            <TableCell className="text-center text-muted-foreground" colSpan={6}>
                              No canonical platforms match this search.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="lookups">
                  <div className="grid gap-4 md:grid-cols-2">
                    {filteredLookupEntries.map(([category, bucket]) => (
                      <Card key={category}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <SlidersHorizontal />
                            <CardTitle className="text-lg">{bucket.label}</CardTitle>
                          </div>
                          <CardDescription>{category}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-2">
                          {bucket.values.map((value) => (
                            <Badge key={`${category}:${lookupValueRaw(value)}`} variant="outline">
                              {lookupValueLabel(value)}
                            </Badge>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                    {filteredLookupEntries.length === 0 ? (
                      <Card>
                        <CardHeader>
                          <CardTitle>No lookup buckets match this search</CardTitle>
                          <CardDescription>Clear the search to review operational dropdown vocabularies.</CardDescription>
                        </CardHeader>
                      </Card>
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent value="hierarchy">
                  <div className="grid gap-3">
                    {data.hierarchy.map((item) => (
                      <Card key={item.name}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start gap-3">
                            <Layers3 />
                            <div>
                              <CardTitle className="text-lg">{item.name}</CardTitle>
                              <CardDescription>{item.app_boundary}</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <PlatformDetailsSheet platform={selectedPlatform} onOpenChange={(open) => !open && setSelectedPlatform(null)} />
    </section>
  );
}
