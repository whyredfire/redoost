import { createContext, createEffect, createSignal, useContext } from 'solid-js'
import type { Accessor } from 'solid-js'
import { Portal } from '@solidjs/web'
import type { JSX } from '@solidjs/web'
import { animated, useReducedMotion } from '@/lib/motion'
import { spring } from '@/components/detent/lib/motion'

type Host = { layers: Accessor<HTMLElement | null>; frame: Accessor<HTMLElement | null>; recede: (on: boolean) => void }
const HostContext = createContext<Host | null>(null)

export function LayerHost(props: { children: JSX.Element; class?: string; layerClass?: string }) {
  const [layers, setLayers] = createSignal<HTMLElement | null>(null)
  const [frame, setFrame] = createSignal<HTMLElement | null>(null)
  const [back, setBack] = createSignal(0)
  const reduce = useReducedMotion()
  const recede = (on: boolean) => setBack((n) => Math.max(0, n + (on ? 1 : -1)))
  return (
    <HostContext value={{ layers, frame, recede }}>
      <div ref={setFrame} class={`relative isolate overflow-hidden ${props.class ?? ''}`}>
        <div class="h-full w-full origin-top" ref={animated(() => (reduce() ? {} : { scale: back() ? 0.97 : 1, opacity: back() ? 0.92 : 1 }), spring.soft)}>
          {props.children}
        </div>
        <div ref={setLayers} class={`pointer-events-none absolute inset-0 z-50 ${props.layerClass ?? ''}`} />
      </div>
    </HostContext>
  )
}

// Client-only app, so always mounted; kept for callers written against the hook
export const useMounted = (): Accessor<boolean> => () => true

export function useHost() {
  const host = useContext(HostContext)
  return { contained: !!host, layers: host?.layers ?? (() => null), frame: host?.frame ?? (() => null), recede: host?.recede ?? (() => {}) }
}

export function Layer(props: { children: JSX.Element }) {
  const { contained, layers } = useHost()
  return <>{contained && !layers() ? null : <Portal mount={contained ? layers()! : document.body}>{props.children}</Portal>}</>
}

export const fill = (contained: boolean) => (contained ? 'absolute inset-0' : 'fixed inset-0')

export type Box = { x: number; y: number; w: number; h: number }
export type Frame = { left: number; top: number; width: number; height: number; scale: number }

export function frameOf(frame: HTMLElement | null): Frame {
  if (!frame) return { left: 0, top: 0, width: innerWidth, height: innerHeight, scale: 1 }
  const r = frame.getBoundingClientRect()
  return { left: r.left, top: r.top, width: frame.offsetWidth, height: frame.offsetHeight, scale: r.width / (frame.offsetWidth || r.width || 1) }
}

export const inFrame = (r: { left: number; top: number; width: number; height: number }, f: Frame): Box => ({ x: (r.left - f.left) / f.scale, y: (r.top - f.top) / f.scale, w: r.width / f.scale, h: r.height / f.scale })

export type Side = 'top' | 'bottom' | 'left' | 'right'
export type Align = 'start' | 'center' | 'end'
const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
const clampTo = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

export function place(anchor: Box, size: { w: number; h: number }, frame: { width: number; height: number }, want: Side, align: Align = 'center', gap = 8, pad = 8) {
  const room: Record<Side, number> = { top: anchor.y, bottom: frame.height - anchor.y - anchor.h, left: anchor.x, right: frame.width - anchor.x - anchor.w }
  const across = want === 'top' || want === 'bottom'
  const need = (across ? size.h : size.w) + gap + pad
  const side = room[want] < need && room[OPPOSITE[want]] > room[want] ? OPPOSITE[want] : want
  let x: number
  let y: number
  if (side === 'top' || side === 'bottom') {
    y = side === 'bottom' ? anchor.y + anchor.h + gap : anchor.y - gap - size.h
    x = align === 'start' ? anchor.x : align === 'end' ? anchor.x + anchor.w - size.w : anchor.x + anchor.w / 2 - size.w / 2
    x = clampTo(x, pad, frame.width - pad - size.w)
    y = clampTo(y, pad, frame.height - pad - size.h)
  } else {
    x = side === 'right' ? anchor.x + anchor.w + gap : anchor.x - gap - size.w
    y = align === 'start' ? anchor.y : align === 'end' ? anchor.y + anchor.h - size.h : anchor.y + anchor.h / 2 - size.h / 2
    y = clampTo(y, pad, frame.height - pad - size.h)
    x = clampTo(x, pad, frame.width - pad - size.w)
  }
  const arrow = side === 'top' || side === 'bottom' ? clampTo(anchor.x + anchor.w / 2 - x, 14, size.w - 14) : clampTo(anchor.y + anchor.h / 2 - y, 14, size.h - 14)
  return { x, y, side, arrow }
}

export function originOf(side: Side, arrow: number) {
  if (side === 'bottom') return `${arrow}px 0px`
  if (side === 'top') return `${arrow}px 100%`
  if (side === 'right') return `0px ${arrow}px`
  return `100% ${arrow}px`
}

const open: object[] = []

type El = () => HTMLElement | null | undefined

export function useDismiss(active: Accessor<boolean>, inside: El[], onDismiss: (why: 'escape' | 'outside') => void) {
  createEffect(active, (on) => {
    if (!on) return
    const token = {}
    open.push(token)
    const top = () => open[open.length - 1] === token
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !top()) return
      e.stopPropagation()
      onDismiss('escape')
    }
    const press = (e: PointerEvent) => {
      if (!top()) return
      const t = e.target as Node
      if (inside.some((el) => el()?.contains(t))) return
      onDismiss('outside')
    }
    document.addEventListener('keydown', key, true)
    document.addEventListener('pointerdown', press, true)
    return () => {
      open.splice(open.indexOf(token), 1)
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('pointerdown', press, true)
    }
  })
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useFocusTrap(box: El, active: Accessor<boolean>, quiet: Accessor<boolean>, first?: El) {
  createEffect(
    () => active() && !quiet(),
    (on) => {
      if (!on) return
      const before = document.activeElement as HTMLElement | null
      const raf = requestAnimationFrame(() => {
        const el = first?.() ?? box()?.querySelector<HTMLElement>(FOCUSABLE) ?? box()
        el?.focus({ preventScroll: true })
      })
      const key = (e: KeyboardEvent) => {
        const root = box()
        if (e.key !== 'Tab' || !root) return
        const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
        if (!all.length) return e.preventDefault()
        const i = all.indexOf(document.activeElement as HTMLElement)
        const next = e.shiftKey ? (i <= 0 ? all.length - 1 : i - 1) : i === all.length - 1 ? 0 : i + 1
        e.preventDefault()
        all[next]?.focus({ preventScroll: true })
      }
      document.addEventListener('keydown', key)
      return () => {
        cancelAnimationFrame(raf)
        document.removeEventListener('keydown', key)
        if (before?.isConnected) before.focus({ preventScroll: true })
      }
    },
  )
}

let locks = 0
export function useScrollLock(active: Accessor<boolean>) {
  createEffect(active, (on) => {
    if (!on) return
    const html = document.documentElement
    if (locks++ === 0) {
      const bar = innerWidth - html.clientWidth
      html.style.overflow = 'hidden'
      if (bar) html.style.paddingRight = `${bar}px`
    }
    return () => {
      if (--locks === 0) {
        html.style.overflow = ''
        html.style.paddingRight = ''
      }
    }
  })
}

export function useReposition(active: Accessor<boolean>, fn: () => void) {
  createEffect(active, (on) => {
    if (!on) return
    addEventListener('resize', fn)
    addEventListener('scroll', fn, true)
    return () => {
      removeEventListener('resize', fn)
      removeEventListener('scroll', fn, true)
    }
  })
}
