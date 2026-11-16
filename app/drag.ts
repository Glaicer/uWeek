import type { PointerEvent as ReactPointerEvent } from "react";

export interface DragOptions {
  zones: string;
  axis: "x" | "y";
  ghost: string;
  onDrop: (zone: HTMLElement, index: number) => void;
}

const mouseThreshold = 4;
const touchDelay = 300;
const touchTolerance = 8;
const edge = 48;
let active = false;

// why: iOS Safari only lets a touchmove listener stop scrolling if it was there before the touch began
if (typeof window !== "undefined")
  window.addEventListener(
    "touchmove",
    (event) => {
      if (active) event.preventDefault();
    },
    { passive: false },
  );

function itemsOf(zone: Element): HTMLElement[] {
  return [...zone.querySelectorAll<HTMLElement>("[data-item]")];
}

export function startDrag(
  event: ReactPointerEvent<HTMLElement>,
  { zones, axis, ghost: ghostClass, onDrop }: DragOptions,
): void {
  if (active || !event.isPrimary || event.button !== 0) return;
  const item = event.currentTarget;
  const touch = event.pointerType === "touch";
  const start = { x: event.clientX, y: event.clientY };
  const home = item.closest<HTMLElement>(zones);
  const homeIndex = home ? itemsOf(home).indexOf(item) : -1;
  let pointer = start;
  let ghost: HTMLElement | null = null;
  let offset = { x: 0, y: 0 };
  let target: { zone: HTMLElement; index: number } | null = null;
  let marked: HTMLElement | null = null;
  let frame = 0;
  let armed = false;
  const timer = touch ? setTimeout(begin, touchDelay) : 0;

  function begin() {
    active = true;
    const box = item.getBoundingClientRect();
    offset = { x: start.x - box.left, y: start.y - box.top };
    ghost = item.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id");
    ghost.removeAttribute("data-item");
    for (const node of ghost.querySelectorAll("[id]"))
      node.removeAttribute("id");
    ghost.className += ` ${ghostClass}`;
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.width = `${box.width}px`;
    ghost.style.height = `${box.height}px`;
    document.body.append(ghost);
    item.dataset.dragging = "";
    document.documentElement.dataset.dragging = "";
    follow();
    frame = requestAnimationFrame(scroll);
  }

  function mark(element: HTMLElement | null, side?: string) {
    if (marked && marked !== element) delete marked.dataset.insert;
    marked = element;
    if (element && side) element.dataset.insert = side;
  }

  function follow() {
    if (!ghost) return;
    ghost.style.transform = `translate(${pointer.x - offset.x}px, ${pointer.y - offset.y}px)`;
    const zone = document
      .elementFromPoint(pointer.x, pointer.y)
      ?.closest<HTMLElement>(zones);
    if (!zone) {
      target = null;
      return mark(null);
    }
    const others = itemsOf(zone).filter((other) => other !== item);
    const coordinate = axis === "x" ? pointer.x : pointer.y;
    const index = others.filter((other) => {
      const box = other.getBoundingClientRect();
      return axis === "x"
        ? box.left + box.width / 2 < coordinate
        : box.top + box.height / 2 < coordinate;
    }).length;
    target = { zone, index };
    if (index < others.length) mark(others[index], "before");
    else if (others.length) mark(others[index - 1], "after");
    else mark(zone, "start");
  }

  function scroll() {
    // why: a row picked up near the window's edge would scroll the page before the pointer moves
    armed ||= pointer.y >= edge && pointer.y <= innerHeight - edge;
    const speed = !armed
      ? 0
      : pointer.y < edge
        ? -(edge - pointer.y) / 3
        : pointer.y > innerHeight - edge
          ? (pointer.y - innerHeight + edge) / 3
          : 0;
    if (speed) {
      scrollBy(0, speed);
      follow();
    }
    frame = requestAnimationFrame(scroll);
  }

  function onMove(move: PointerEvent) {
    if (move.pointerId !== event.pointerId) return;
    pointer = { x: move.clientX, y: move.clientY };
    if (ghost) return follow();
    const distance = Math.hypot(pointer.x - start.x, pointer.y - start.y);
    if (touch) {
      if (distance > touchTolerance) finish();
    } else if (distance > mouseThreshold) begin();
  }

  function onUp(up: PointerEvent) {
    if (up.pointerId !== event.pointerId) return;
    const drop = ghost ? target : null;
    finish();
    if (drop && !(drop.zone === home && drop.index === homeIndex))
      onDrop(drop.zone, drop.index);
  }

  function onCancel(cancel: Event) {
    if (cancel instanceof KeyboardEvent && cancel.key !== "Escape") return;
    finish();
  }

  function onContextMenu(menu: Event) {
    if (touch) menu.preventDefault();
  }

  function finish() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerup", onUp);
    removeEventListener("pointercancel", onCancel);
    removeEventListener("keydown", onCancel);
    removeEventListener("contextmenu", onContextMenu);
    removeEventListener("blur", onCancel);
    mark(null);
    if (!ghost) return;
    ghost.remove();
    delete item.dataset.dragging;
    delete document.documentElement.dataset.dragging;
    active = false;
    const swallow = (click: Event) => {
      click.preventDefault();
      click.stopPropagation();
    };
    addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener("click", swallow, { capture: true }));
  }

  addEventListener("pointermove", onMove);
  addEventListener("pointerup", onUp);
  addEventListener("pointercancel", onCancel);
  addEventListener("keydown", onCancel);
  addEventListener("contextmenu", onContextMenu);
  addEventListener("blur", onCancel);
}
