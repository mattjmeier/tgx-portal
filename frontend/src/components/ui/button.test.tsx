import { render, screen } from "@testing-library/react";

import { Button } from "./button";

describe("Button", () => {
  it("renders shared shadcn-style classes and accepts custom class names", () => {
    render(
      <Button className="custom-class" type="button">
        Generate Config
      </Button>,
    );

    const button = screen.getByRole("button", { name: /generate config/i });

    expect(button).toHaveClass("inline-flex");
    expect(button).toHaveClass("items-center");
    expect(button).toHaveClass("justify-center");
    expect(button).toHaveClass("rounded-md");
    expect(button).toHaveClass("bg-primary");
    expect(button).toHaveClass("text-primary-foreground");
    expect(button).toHaveClass("custom-class");
  });
});
