import { createEffect, createMemo, createSignal, For, onSettled, Show, untrack } from 'solid-js'
import { animate, motionValue, styleEffect } from 'motion'
import { animated } from '@/lib/motion'

const roll = { type: 'spring', stiffness: 380, damping: 34, mass: 0.8 } as const

export function RollingText(props: { text: string; class?: string; proportional?: boolean; still?: boolean }) {
  // Keyed from the right, so digits keep their place as the text grows
  const chars = createMemo(() => {
    const all = [...props.text]
    return all.map((c, i) => ({ c, digit: /\d/.test(c), key: /\d/.test(c) ? `${all.length - i}` : `${all.length - i}${c}` }))
  })
  let probe: HTMLSpanElement | undefined
  const [widths, setWidths] = createSignal<number[] | null>(null)

  createEffect(
    () => !!props.proportional,
    (proportional) => {
      if (!proportional || !probe) return
      const read = () => {
        const box = probe!
        const z = box.offsetWidth ? box.getBoundingClientRect().width / box.offsetWidth : 1
        const em = parseFloat(getComputedStyle(box).fontSize) || 16
        setWidths([...box.children].map((c) => (c as HTMLElement).getBoundingClientRect().width / z / em))
      }
      read()
      void document.fonts?.ready.then(read)
    },
  )

  return (
    <span class={`relative inline-flex ${props.proportional ? '' : 'tnum'} ${props.class ?? ''}`} style={{ 'line-height': '1.25em', height: '1.25em' }}>
      <span class="sr-only">{props.text}</span>
      <Show when={props.proportional}>
        <span aria-hidden="true" class="pointer-events-none absolute left-0 top-0 size-0 overflow-hidden">
          <span ref={(el) => (probe = el)} class="invisible flex w-max whitespace-pre">
            {Array.from({ length: 10 }, (_, n) => (
              <span>{n}</span>
            ))}
          </span>
        </span>
      </Show>
      <For each={chars()} keyed={(x) => x.key}>
        {(x) => (
          <Show
            when={x().digit}
            fallback={
              <span aria-hidden="true" class="whitespace-pre">
                {x().c}
              </span>
            }
          >
            <Digit d={+x().c} width={props.proportional && widths() ? widths()![+x().c] : undefined} still={!!props.still} />
          </Show>
        )}
      </For>
    </span>
  )
}

function Digit(props: { d: number; width?: number; still: boolean }) {
  // motion.span style={{ width }} on a motion value, so the width springs in em
  const w = motionValue<string>(untrack(() => (props.width === undefined ? '1ch' : `${props.width}em`)))
  let had = untrack(() => props.width !== undefined)
  let stop: VoidFunction | undefined
  onSettled(() => () => stop?.())
  createEffect(
    () => props.width,
    (width) => {
      if (width === undefined) return
      if (!had) {
        had = true
        w.set(`${width}em`)
        return
      }
      const ctl = animate(w, `${width}em`, roll)
      return () => ctl.stop()
    },
  )

  return (
    <span ref={(el) => (stop = styleEffect(el, { width: w }))} aria-hidden="true" class="relative inline-block overflow-hidden" style={{ height: '1.25em' }}>
      <span class="absolute inset-x-0 top-0 flex flex-col items-center" ref={animated(() => ({ y: `${-props.d * 10}%` }), () => (props.still ? { duration: 0 } : roll))}>
        {Array.from({ length: 10 }, (_, n) => (
          <span class="block" style={{ height: '1.25em' }}>
            {n}
          </span>
        ))}
      </span>
    </span>
  )
}
