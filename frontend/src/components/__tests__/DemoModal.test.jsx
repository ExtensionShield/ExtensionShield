import React, { useState, useRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import DemoModal from "../DemoModal";

function TestWrapper() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  return (
    <>
      <button type="button" ref={triggerRef} onClick={() => setOpen(true)}>
        Step-by-step guide
      </button>
      <DemoModal isOpen={open} onClose={() => setOpen(false)} triggerRef={triggerRef} />
    </>
  );
}

describe("DemoModal", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  it("opens on Step-by-step guide click, walks steps 1→3, then finishes and closes", async () => {
    render(<TestWrapper />);

    const watchDemoBtn = screen.getByRole("button", { name: /step-by-step guide/i });
    fireEvent.click(watchDemoBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    const img = within(dialog).getByRole("img", { hidden: true });
    expect(img).toHaveAttribute("src", expect.stringContaining("Demo-step1"));

    // Advance to step 2
    fireEvent.click(within(dialog).getByRole("button", { name: /next step/i }));
    expect(within(dialog).getByRole("img", { hidden: true })).toHaveAttribute("src", expect.stringContaining("Demo-step2"));

    // The Next button is disabled for ~400ms during the slide animation; wait for
    // it to re-enable before advancing again (the component debounces step changes).
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /next step/i })).toBeEnabled());

    // Advance to step 3 (last step)
    fireEvent.click(within(dialog).getByRole("button", { name: /next step/i }));
    expect(within(dialog).getByRole("img", { hidden: true })).toHaveAttribute("src", expect.stringContaining("Demo-step3"));

    // On the last step the action button finishes the walkthrough and closes the modal
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /finish walkthrough/i })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole("button", { name: /finish walkthrough/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
