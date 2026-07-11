// TEMPORARY — site-wide methodology notice modal.
// To remove later: delete this file, MethodologyNoticeModal.copy.js,
// MethodologyNoticeModal.scss and MethodologyNoticeModal.test.jsx, then remove
// the <MethodologyNoticeModal /> mount + its import in src/App.jsx.
//
// Frontend/display only. Uses Radix Dialog primitives for accessible modal
// behaviour (focus trap, aria-modal, labelled/described) and the site design
// tokens (via MethodologyNoticeModal.scss) so it matches the current site theme.
// It is an acknowledgement notice: Esc / outside clicks are intentionally
// disabled so it closes only via the "I understand" button.
import React, { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  METHODOLOGY_NOTICE,
  METHODOLOGY_NOTICE_STORAGE_KEY,
} from "./MethodologyNoticeModal.copy";
import "./MethodologyNoticeModal.scss";

function hasDismissed() {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage.getItem(METHODOLOGY_NOTICE_STORAGE_KEY) === "1"
    );
  } catch {
    // Storage blocked (private mode / disabled) — fail open, show the notice.
    return false;
  }
}

// Skip automated browsers (headless prerender snapshot, Playwright visual tests)
// so the notice is never baked into static SEO HTML or captured in visual
// regressions. Real users are unaffected.
function isAutomatedBrowser() {
  return typeof navigator !== "undefined" && navigator.webdriver === true;
}

export default function MethodologyNoticeModal() {
  const [open, setOpen] = useState(false);

  // Client-only: decide visibility after mount so prerender/SSR never touches
  // localStorage and there is no hydration mismatch.
  useEffect(() => {
    if (!hasDismissed() && !isAutomatedBrowser()) setOpen(true);
  }, []);

  // The notice closes ONLY via the explicit "I understand" button — Esc,
  // outside/overlay clicks and focus-outside are all prevented below. That same
  // click is the only thing that persists the dismissal.
  const acknowledge = () => {
    try {
      window.localStorage.setItem(METHODOLOGY_NOTICE_STORAGE_KEY, "1");
    } catch {
      // Storage unavailable — still close for this session.
    }
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="methodology-notice-overlay">
          <Dialog.Content
            className="methodology-notice-panel"
            onEscapeKeyDown={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <Dialog.Title className="methodology-notice-title">
              {METHODOLOGY_NOTICE.title}
            </Dialog.Title>
            <Dialog.Description className="methodology-notice-body">
              {METHODOLOGY_NOTICE.body}
            </Dialog.Description>
            <div className="methodology-notice-actions">
              <button
                type="button"
                className="methodology-notice-button"
                onClick={acknowledge}
                autoFocus
              >
                {METHODOLOGY_NOTICE.dismissLabel}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
