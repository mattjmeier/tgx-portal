import type { ReactNode } from "react";

import { Separator } from "./ui/separator";

type WorkspaceDetailField = {
  label: string;
  value: ReactNode;
};

type WorkspaceDetailFieldListProps = {
  fields: WorkspaceDetailField[];
};

export function WorkspaceDetailFieldList({ fields }: WorkspaceDetailFieldListProps) {
  return (
    <dl className="flex flex-col">
      {fields.map((field, index) => (
        <div className="flex flex-col gap-3" key={field.label}>
          <div className="flex flex-col gap-1.5">
            <dt className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{field.label}</dt>
            <dd className="m-0 text-sm text-foreground">{field.value}</dd>
          </div>
          {index < fields.length - 1 ? <Separator /> : null}
        </div>
      ))}
    </dl>
  );
}
