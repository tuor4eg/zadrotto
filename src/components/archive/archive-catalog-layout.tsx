"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type FixedPreviewState = {
  height: number;
  isFixed: boolean;
  left: number;
  minHeight: number;
  width: number;
};

type ArchiveCatalogLayoutProps = {
  children: ReactNode;
  footer?: ReactNode;
  preview: ReactNode;
  previewKey?: string | number | null;
  toolbar?: ReactNode;
};

const FIXED_PREVIEW_TOP_OFFSET = 96;
const FIXED_PREVIEW_BOTTOM_OFFSET = 16;

const EMPTY_FIXED_PREVIEW_STATE: FixedPreviewState = {
  height: 0,
  isFixed: false,
  left: 0,
  minHeight: 0,
  width: 0,
};

export function ArchiveCatalogLayout({
  children,
  footer,
  preview,
  previewKey,
  toolbar,
}: ArchiveCatalogLayoutProps) {
  const previewPanelRef = useRef<HTMLElement>(null);
  const previewSlotRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<number | null>(null);
  const [fixedPreview, setFixedPreview] = useState<FixedPreviewState>(
    EMPTY_FIXED_PREVIEW_STATE,
  );
  const previewSlotStyle: CSSProperties | undefined = fixedPreview.isFixed
    ? { minHeight: fixedPreview.height }
    : undefined;
  const previewPanelStyle: CSSProperties | undefined = fixedPreview.isFixed
    ? {
        left: fixedPreview.left,
        minHeight: fixedPreview.minHeight,
        position: "fixed",
        top: FIXED_PREVIEW_TOP_OFFSET,
        width: fixedPreview.width,
        zIndex: 20,
      }
    : fixedPreview.minHeight > 0
      ? { minHeight: fixedPreview.minHeight }
      : undefined;

  useEffect(() => {
    const desktopMediaQuery = window.matchMedia("(min-width: 1280px)");

    function updateFixedPreview() {
      const previewPanel = previewPanelRef.current;
      const previewSlot = previewSlotRef.current;

      if (!previewPanel || !previewSlot || !desktopMediaQuery.matches) {
        setFixedPreview((currentState) =>
          currentState.isFixed || currentState.height > 0
            ? EMPTY_FIXED_PREVIEW_STATE
            : currentState,
        );
        return;
      }

      const slotRect = previewSlot.getBoundingClientRect();
      const isFixed = slotRect.top <= FIXED_PREVIEW_TOP_OFFSET;
      const panelTop = isFixed
        ? FIXED_PREVIEW_TOP_OFFSET
        : Math.max(slotRect.top, FIXED_PREVIEW_TOP_OFFSET);
      const availableHeight = Math.max(
        0,
        window.innerHeight - panelTop - FIXED_PREVIEW_BOTTOM_OFFSET,
      );
      const height = Math.max(previewPanel.offsetHeight, availableHeight);
      const nextState: FixedPreviewState = {
        height,
        isFixed,
        left: slotRect.left,
        minHeight: availableHeight,
        width: slotRect.width,
      };

      setFixedPreview((currentState) =>
        currentState.height === nextState.height &&
        currentState.isFixed === nextState.isFixed &&
        Math.round(currentState.left) === Math.round(nextState.left) &&
        Math.round(currentState.minHeight) === Math.round(nextState.minHeight) &&
        Math.round(currentState.width) === Math.round(nextState.width)
          ? currentState
          : nextState,
      );
    }

    function scheduleFixedPreviewUpdate() {
      if (previewFrameRef.current !== null) {
        return;
      }

      previewFrameRef.current = window.requestAnimationFrame(() => {
        previewFrameRef.current = null;
        updateFixedPreview();
      });
    }

    updateFixedPreview();
    window.addEventListener("scroll", scheduleFixedPreviewUpdate, { passive: true });
    window.addEventListener("resize", scheduleFixedPreviewUpdate);
    desktopMediaQuery.addEventListener("change", scheduleFixedPreviewUpdate);

    return () => {
      if (previewFrameRef.current !== null) {
        window.cancelAnimationFrame(previewFrameRef.current);
      }

      window.removeEventListener("scroll", scheduleFixedPreviewUpdate);
      window.removeEventListener("resize", scheduleFixedPreviewUpdate);
      desktopMediaQuery.removeEventListener("change", scheduleFixedPreviewUpdate);
    };
  }, [previewKey]);

  return (
    <section className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(290px,0.28fr)]">
      <div className="archive-paper archive-panel archive-stack archive-stack-right flex min-h-0 min-w-0 flex-col p-4">
        {toolbar}

        <div
          className={`archive-scrollbar grid min-h-0 flex-1 grid-cols-3 content-start gap-2.5 overflow-y-auto pl-1 pr-1 md:grid-cols-4 xl:grid-cols-6 ${
            toolbar ? "mt-2" : ""
          }`}
        >
          {children}
        </div>

        {footer ? <div className="mt-3 pl-1 pr-4">{footer}</div> : null}
      </div>

      <div
        ref={previewSlotRef}
        className="relative hidden min-w-0 overflow-visible xl:block"
        style={previewSlotStyle}
      >
        <article
          ref={previewPanelRef}
          className="archive-paper archive-panel archive-stack archive-stack-left relative flex w-full min-w-0 flex-col overflow-visible"
          style={previewPanelStyle}
        >
          {preview}
        </article>
      </div>
    </section>
  );
}
