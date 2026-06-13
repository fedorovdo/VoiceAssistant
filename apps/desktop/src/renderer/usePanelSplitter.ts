import { useCallback, useEffect, useRef } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { LayoutMode } from "@voiceassistant/shared";

const defaultRatio = 0.5;
const minimumRatio = 0.2;
const maximumRatio = 0.8;

interface UsePanelSplitterOptions {
  mode: LayoutMode;
  ratio: number;
  onRatioChange: (ratio: number) => void;
  onRatioCommit: (ratio: number) => void;
}

interface PanelSplitterResult {
  containerRef: RefObject<HTMLElement>;
  splitterStyle: CSSProperties;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export function usePanelSplitter({
  mode,
  ratio,
  onRatioChange,
  onRatioCommit
}: UsePanelSplitterOptions): PanelSplitterResult {
  const containerRef = useRef<HTMLElement>(null);
  const ratioRef = useRef(ratio);

  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);

  const updateRatio = useCallback((nextRatio: number, commit = false) => {
    const clampedRatio = clampRatio(nextRatio);
    ratioRef.current = clampedRatio;
    onRatioChange(clampedRatio);
    if (commit) onRatioCommit(clampedRatio);
  }, [onRatioChange, onRatioCommit]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const size = mode === "vertical" ? rect.height : rect.width;
      if (size <= 0) return;

      const offset = mode === "vertical"
        ? pointerEvent.clientY - rect.top
        : pointerEvent.clientX - rect.left;
      updateRatio(offset / size);
    };
    const handlePointerUp = () => {
      document.body.classList.remove("is-resizing-panels");
      document.body.style.removeProperty("cursor");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      onRatioCommit(ratioRef.current);
    };

    document.body.classList.add("is-resizing-panels");
    document.body.style.cursor = mode === "vertical" ? "row-resize" : "col-resize";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }, [mode, onRatioCommit, updateRatio]);

  const onDoubleClick = useCallback(() => {
    updateRatio(defaultRatio, true);
  }, [updateRatio]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const decreaseKey = mode === "vertical" ? "ArrowUp" : "ArrowLeft";
    const increaseKey = mode === "vertical" ? "ArrowDown" : "ArrowRight";
    if (event.key !== decreaseKey && event.key !== increaseKey) return;

    event.preventDefault();
    const direction = event.key === decreaseKey ? -1 : 1;
    updateRatio(ratioRef.current + direction * 0.05, true);
  }, [mode, updateRatio]);

  return {
    containerRef,
    splitterStyle: { "--panel-primary-size": `calc(${ratio * 100}% - 5px)` } as CSSProperties,
    onPointerDown,
    onDoubleClick,
    onKeyDown
  };
}

export function normalizeSplitterRatio(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampRatio(value)
    : defaultRatio;
}

function clampRatio(value: number): number {
  return Math.min(maximumRatio, Math.max(minimumRatio, value));
}
