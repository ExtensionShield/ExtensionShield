import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MethodologyNoticeModal from "../MethodologyNoticeModal";
import {
  METHODOLOGY_NOTICE,
  METHODOLOGY_NOTICE_STORAGE_KEY,
} from "../MethodologyNoticeModal.copy";

describe("MethodologyNoticeModal", () => {
  beforeEach(() => {
    // Radix Dialog reads matchMedia; jsdom lacks it.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    );
    localStorage.clear();
  });

  it("shows on load when not previously dismissed, with the centralized copy", async () => {
    render(<MethodologyNoticeModal />);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(METHODOLOGY_NOTICE.title)).toBeInTheDocument();
    expect(screen.getByText(METHODOLOGY_NOTICE.body)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: METHODOLOGY_NOTICE.dismissLabel })
    ).toBeInTheDocument();
  });

  it("dismisses on 'I understand', closes, and persists the flag in localStorage", async () => {
    render(<MethodologyNoticeModal />);
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: METHODOLOGY_NOTICE.dismissLabel }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(localStorage.getItem(METHODOLOGY_NOTICE_STORAGE_KEY)).toBe("1");
  });

  it("stays open on Escape — only 'I understand' closes it", async () => {
    render(<MethodologyNoticeModal />);
    const dialog = await screen.findByRole("dialog");

    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(localStorage.getItem(METHODOLOGY_NOTICE_STORAGE_KEY)).toBeNull();
  });

  it("does not show again when already dismissed", () => {
    localStorage.setItem(METHODOLOGY_NOTICE_STORAGE_KEY, "1");
    render(<MethodologyNoticeModal />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not show in automated browsers (prerender / visual tests)", () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "webdriver");
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    try {
      render(<MethodologyNoticeModal />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      if (original) Object.defineProperty(navigator, "webdriver", original);
      else delete navigator.webdriver;
    }
  });
});
