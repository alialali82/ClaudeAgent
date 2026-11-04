// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import Home from "./page";

it("renders the upload step", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { name: /your portfolio/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/choose a file/i)).toBeInTheDocument();
});
