import { createEffect, createMemo, For, onSettled, untrack } from "solid-js";

import { ease, spring, dur } from "@/components/detent/lib/motion";
import { afterAnimation, animated, animateTo, Presence } from "@/lib/motion";

export interface Sheet {
  id: string;
  name: string;
}

const FW = 224;
const FH = 168;
const PLACEHOLDERS = ["p1", "p2"];

const hash = (s: string) => {
  let h = 7;

  for (const c of s) {
    h = Math.imul(h * 31 + (c.codePointAt(0) ?? 0), 1);
  }

  return Math.abs(h);
};

const UploadIcon = () => (
  <svg
    width={26}
    height={26}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={2}
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 14.5v2.3A3.2 3.2 0 0 0 7.2 20h9.6a3.2 3.2 0 0 0 3.2-3.2v-2.3" />
    <path d="M12 15V7" />
    <path d="M12 3.2 7.6 8.2h8.8z" fill="currentColor" />
  </svg>
);

const SheetFace = (props: { name: string }) => {
  const ext = () =>
    props.name.includes(".") ? (props.name.split(".").pop() ?? "") : "";

  return (
    <>
      <span
        class="flex h-[62px] items-center justify-center rounded-[7px] text-[10px] font-semibold tracking-[0.06em] text-[var(--folder-ink)]"
        style={{
          background:
            "color-mix(in oklch, var(--sheet-line) 55%, var(--sheet))",
        }}
      >
        {ext().toUpperCase()}
      </span>
      <span class="text-caption text-ink-2 mt-1.5 truncate px-0.5 font-medium">
        {props.name}
      </span>
      <span class="mt-1 h-[3px] w-1/2 rounded-full bg-[var(--sheet-line)]" />
    </>
  );
};

export const Folder = (props: {
  open: boolean;
  sheets?: Sheet[];
  pct?: number;
  busy?: boolean;
}) => {
  const papers = createMemo<{ id: string; sheet?: Sheet }[]>(() => {
    const shown = (props.sheets ?? []).slice(0, 4).toReversed();

    return shown.length
      ? shown.map((s) => ({ id: s.id, sheet: s }))
      : PLACEHOLDERS.map((id) => ({ id }));
  });

  let front!: HTMLDivElement;
  let ready = false;
  onSettled(() => {
    ready = true;
  });

  return (
    <div
      aria-hidden="true"
      class="relative shrink-0"
      style={{ width: `${FW}px`, height: `${FH}px`, perspective: "720px" }}
    >
      <div
        class="absolute top-0 left-0 h-[30px] w-[96px] bg-[var(--folder-back)]"
        style={{
          "border-radius": "14px 14px 0 0",
          "clip-path": "polygon(0 0, 78% 0, 100% 100%, 0 100%)",
        }}
      />
      <div
        class="absolute inset-x-0 top-[22px] bottom-0 rounded-[18px] bg-[var(--folder-back)]"
        style={{ "box-shadow": "inset 0 -12px 24px -16px rgb(0 0 0 / 0.25)" }}
      />

      <For each={papers()} keyed={(p) => p.id}>
        {(p, k) => {
          let el!: HTMLDivElement;
          const fresh = ready;
          let first = true;
          const h = untrack(() => hash(p().id));
          const rot = ((h % 7) - 3) * 1.4;
          const dx = ((h % 5) - 2) * 3;
          createEffect(
            () => ({
              target: {
                y: (props.open ? -16 : 0) - (papers().length - 1 - k()) * 6,
                x: dx,
                rotate: rot,
                opacity: 1,
                scale: 1,
              },
              sheet: !!p().sheet,
              k: k(),
            }),
            ({ target, sheet, k: order }) => {
              const transition = {
                ...spring.soft,
                delay: sheet ? order * 0.08 : 0,
              };

              if (first && fresh && sheet) {
                animateTo(
                  el,
                  {
                    ...target,
                    y: [-150, target.y],
                    rotate: [rot * 3, rot],
                    opacity: [0, 1],
                    scale: [0.92, 1],
                  },
                  transition
                );
              } else {
                animateTo(el, target, first ? { duration: 0 } : transition);
              }

              first = false;
            }
          );
          onSettled(() => () => {
            if (!front.isConnected) {
              return;
            }

            const ghost = el.cloneNode(true);

            if (!(ghost instanceof Element)) {
              return;
            }

            front.before(ghost);
            afterAnimation(
              animateTo(
                ghost,
                { opacity: 0, y: -20, x: dx, rotate: rot },
                { duration: dur.exit, ease: ease.out }
              ),
              () => ghost.remove()
            );
          });

          return (
            <div
              ref={el}
              class="absolute top-[36px] left-1/2 flex flex-col overflow-hidden rounded-[10px] bg-[var(--sheet)] p-1.5"
              style={{
                width: "172px",
                height: "112px",
                "margin-left": "-86px",
                "box-shadow":
                  "inset 0 1px 0 rgb(255 255 255 / 0.6), 0 4px 10px -4px rgb(0 0 0 / 0.22)",
              }}
            >
              {p().sheet ? (
                <SheetFace name={p().sheet?.name ?? ""} />
              ) : (
                <span class="flex-1 rounded-[7px] bg-[var(--sheet-line)] opacity-60" />
              )}
            </div>
          );
        }}
      </For>

      <div
        ref={[
          (el: HTMLDivElement) => (front = el),
          animated(
            () => ({ rotateX: props.open ? -30 : 0 }),
            () => (props.open ? spring.soft : spring.pop)
          ),
        ]}
        class="absolute inset-x-0 bottom-0 h-[112px] rounded-[18px] bg-[var(--folder-front)]"
        style={{
          "transform-origin": "50% 100%",
          "box-shadow":
            "inset 0 1px 0 light-dark(rgb(255 255 255 / 0.55), transparent), inset 0 0 0 1px light-dark(transparent, rgb(255 255 255 / 0.145)), 0 -8px 20px -12px rgb(0 0 0 / 0.25)",
        }}
      >
        <div
          class="pointer-events-none absolute inset-0 rounded-[18px] bg-black"
          ref={animated(() => ({ opacity: props.open ? 0.08 : 0 }), {
            duration: 0.3,
            ease: ease.out,
          })}
        />
        <div class="absolute inset-x-0 top-[34px] flex justify-center text-[var(--folder-ink)]">
          <span
            ref={animated(() => ({ y: props.open ? -3 : 0 }), spring.snappy)}
          >
            <UploadIcon />
          </span>
        </div>
        <Presence
          when={props.busy}
          appear
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          exitTransition={{
            duration: dur.exit,
            ease: ease.out,
            delay: dur.enter,
          }}
          transition={{ duration: dur.enter, ease: ease.out }}
        >
          {() => (
            <div class="absolute inset-x-6 bottom-5 h-[4px] overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.1]">
              <div
                class="h-full rounded-full bg-[var(--folder-ink)]"
                ref={animated(
                  () => ({ width: `${props.pct ?? 0}%` }),
                  spring.release
                )}
              />
            </div>
          )}
        </Presence>
      </div>
    </div>
  );
};
