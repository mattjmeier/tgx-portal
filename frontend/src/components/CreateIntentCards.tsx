import { Link } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

type CreateIntent = {
  cta: string;
  description: string;
  eyebrow: string;
  title: string;
  to: string;
};

type CreateIntentCardsProps = {
  items: CreateIntent[];
};

export function CreateIntentCards({ items }: CreateIntentCardsProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => (
        <Card className="border-border/70 shadow-sm" key={item.title}>
          <CardHeader className="gap-3">
            <p className="eyebrow">{item.eyebrow}</p>
            <CardTitle className="text-xl">{item.title}</CardTitle>
            <CardDescription className="text-sm leading-6 text-muted-foreground">{item.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link className="secondary-button" to={item.to}>
              {item.cta}
            </Link>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
