import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { clamp, feedback, lerp, notched } from '@/components/detent/lib/detent'
import { Layer, fill, frameOf, inFrame, useDismiss, useHost, useReposition } from '@/components/detent/lib/layer'

const ROW = 36
const PAD = 6
const LEFT = 14
const RIGHT = 34
const OPEN = { type: 'spring', bounce: 0, duration: 0.3 } as const
const SHUT = { type: 'spring', bounce: 0, duration: 0.24 } as const
const FOLLOW = { type: 'spring', stiffness: 900, damping: 60 } as const
const LOST = 48
const NOW = { duration: 0 } as const
const EDGE = 'drop-shadow(0 0 .5px var(--edge)) drop-shadow(0 1px 1px rgb(0 0 0 / .05))'
const INK = '[--edge:rgb(0_0_0/.3)] dark:[--edge:rgb(255_255_255/.3)]'

const rubber = (d: number) => 18 * (1 - 1 / (1 + d / 60))

function Check() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden className="absolute right-3.5 size-3.5 self-center" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7.5 5.6 10.5 11.5 3.5" />
    </svg>
  )
}

function Updown() {
  return (
    <svg viewBox="0 0 10 14" aria-hidden className="h-3.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5 5 2l3 3M2 9l3 3 3-3" />
    </svg>
  )
}

export type PopupProps = {
  options: string[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  label?: string
  name?: string
  radius?: number
  textClass?: string
  className?: string
  disabled?: boolean
}

export function Popup({ options, value: controlled, defaultValue, onChange, label, name, radius = 10, textClass = 'text-[14px] font-medium', className = '', disabled = false }: PopupProps) {
  const reduce = !!useReducedMotion()
  const id = useId()
  const { contained, frame } = useHost()
  const [inner, setInner] = useState(() => Math.max(0, options.indexOf(defaultValue ?? '')))
  const value = controlled === undefined ? inner : Math.max(0, options.indexOf(controlled))
  const start = value
  const [shown, setShown] = useState(false)
  const [active, setActive] = useState(start)
  const [from, setFrom] = useState(start)
  const [spot, setSpot] = useState({ x: 0, y: 0 })
  const [width, setWidth] = useState(0)

  const pill = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const probes = useRef<(HTMLSpanElement | null)[]>([])
  const nudge = useRef({ x: 0, y: 0 })
  const live = useRef({ mode: 'shut' as 'shut' | 'press' | 'tap', y0: 0, u0: 0, left: false, lost: false, active: start, value: start, l: 0, r: 0 })

  const open = useMotionValue(0)
  const anchor = useMotionValue(start)
  const plate = useMotionValue(start * ROW)
  const pull = useMotionValue(0)
  const pillW = useMotionValue(0)
  const on = useMotionValue(1)
  const fade = useMotionValue(0)
  const pillO = useTransform(fade, (f) => 1 - f)
  const height = PAD * 2 + ROW * options.length
  const widthRef = useRef(0)

  const y = useTransform([open, anchor, pull], ([o = 0, a = 0, p = 0]: number[]) => -(PAD + ROW * a) + nudge.current.y * o + p)
  const x = useTransform(open, (o) => nudge.current.x * o)
  const clip = useTransform([open, anchor, pillW], ([o = 0, a = 0, w = 0]: number[]) => {
    const top = (PAD + ROW * a) * (1 - o)
    const bottom = (height - PAD - ROW * (a + 1)) * (1 - o)
    return `inset(${top}px ${(widthRef.current - w) * (1 - o)}px ${bottom}px 0 round ${lerp(radius, 16, o)}px)`
  })
  const window_ = useTransform(plate, (p) => `inset(${PAD + p}px ${PAD}px ${height - PAD - ROW - p}px ${PAD}px round 10px)`)
  const inverted = useTransform([open, on], ([o = 0, v = 0]: number[]) => clamp((o - 0.3) / 0.5, 0, 1) * v)

  const widths = () => probes.current.map((p) => (p?.offsetWidth ?? 0) + LEFT + RIGHT)

  useLayoutEffect(() => {
    const read = () => {
      const all = widths()
      pillW.set(all[live.current.value] ?? 0)
      widthRef.current = Math.max(...all)
      setWidth(widthRef.current)
    }
    read()
    void document.fonts?.ready.then(read)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.join('\n')])

  useEffect(() => {
    if (live.current.mode !== 'shut' || live.current.value === value) return
    live.current.value = value
    anchor.set(value)
    pillW.set(widths()[value] ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const measure = () => {
    const f = frameOf(frame)
    const box = inFrame(pill.current!.getBoundingClientRect(), f)
    return { f, box }
  }

  const mark = (i: number) => {
    if (live.current.active === i) return
    live.current.active = i
    setActive(i)
  }

  const show = (instant: boolean) => {
    const s = live.current
    const { f, box } = measure()
    const top = box.y - PAD - ROW * s.value
    nudge.current = {
      x: Math.min(0, f.width - 8 - (box.x + widthRef.current)),
      y: top < 12 ? 12 - top : Math.min(0, f.height - 12 - (top + height)),
    }
    setSpot({ x: box.x, y: box.y })
    const at = pill.current!.getBoundingClientRect()
    s.l = at.left + nudge.current.x
    s.r = s.l + widthRef.current
    s.active = s.value
    setActive(s.value)
    setFrom(s.value)
    plate.set(s.value * ROW)
    fade.set(1)
    on.set(1)
    if (sheet.current) sheet.current.style.pointerEvents = ''
    setShown(true)
    anchor.set(s.value)
    animate(pull, 0, NOW)
    animate(open, 1, instant || reduce ? NOW : OPEN)
  }

  const hide = (instant = false) => {
    const s = live.current
    s.mode = 'shut'
    if (sheet.current) sheet.current.style.pointerEvents = 'none'
    animate(pull, 0, SHUT)
    animate(pillW, widths()[s.value] ?? 0, instant || reduce ? NOW : SHUT)
    animate(fade, 0, instant || reduce ? NOW : { duration: 0.18, ease: [0.2, 0.9, 0.25, 1] })
    animate(open, 0, instant || reduce ? NOW : SHUT).then(() => {
      if (live.current.mode === 'shut') setShown(false)
    })
  }

  const commit = (i: number) => {
    const changed = live.current.value !== i
    live.current.value = i
    setInner(i)
    hide()
    if (changed) onChange?.(options[i]!)
  }

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || disabled) return
    const s = live.current
    feedback.wake(true)
    if (s.mode !== 'shut') return hide()
    e.currentTarget.setPointerCapture(e.pointerId)
    s.mode = 'press'
    s.y0 = e.clientY
    s.u0 = s.value * ROW
    s.left = false
    s.lost = false
    show(false)
  }

  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const s = live.current
    if (s.mode !== 'press') return
    const d = e.clientY - s.y0
    s.lost = e.clientX < s.l - LOST || e.clientX > s.r + LOST
    on.set(s.lost ? 0 : 1)
    const hi = ROW * (options.length - 1)
    const u = s.u0 + d
    pull.set(u < 0 ? -rubber(-u) : u > hi ? rubber(u - hi) : 0)
    const near = clamp(u, 0, hi)
    plate.set(notched(near, options.map((_, i) => i * ROW), ROW / 2, 0.9))
    const i = Math.round(near / ROW)
    if (i !== s.active) {
      s.left = true
      mark(i)
      feedback.tick()
    }
  }

  const up = () => {
    const s = live.current
    if (s.mode !== 'press') return
    if (s.lost) return hide()
    if (!s.left) {
      s.mode = 'tap'
      pull.set(0)
      animate(plate, s.active * ROW, FOLLOW)
      return
    }
    commit(s.active)
  }

  const hover = (i: number) => {
    if (live.current.mode !== 'tap') return
    mark(i)
    animate(plate, i * ROW, reduce ? NOW : FOLLOW)
  }

  const keys = (e: KeyboardEvent) => {
    const s = live.current
    if (s.mode === 'shut') {
      if (disabled) return
      if (!['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) return
      e.preventDefault()
      s.mode = 'tap'
      return show(true)
    }
    const last = options.length - 1
    const go = { ArrowUp: s.active - 1, ArrowDown: s.active + 1, Home: 0, End: last }[e.key]
    if (go !== undefined) {
      e.preventDefault()
      const i = clamp(go, 0, last)
      mark(i)
      plate.set(i * ROW)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      commit(s.active)
    }
  }

  useDismiss(shown, [pill, sheet], (why) => hide(why === 'escape'))
  useReposition(shown, () => {
    const { box } = measure()
    setSpot({ x: box.x, y: box.y })
  })

  const rows = (ghost: boolean) =>
    options.map((o, i) => (
      <div
        key={o}
        id={ghost ? undefined : `${id}-${i}`}
        role={ghost ? undefined : 'option'}
        aria-selected={ghost ? undefined : i === value}
        onPointerMove={ghost ? undefined : () => hover(i)}
        onClick={ghost ? undefined : () => live.current.mode === 'tap' && commit(i)}
        className="relative flex items-center whitespace-nowrap"
        style={{ height: ROW, paddingLeft: LEFT }}
      >
        {o}
        {i === from && <Check />}
      </div>
    ))

  return (
    <div className={`relative inline-block max-w-full align-middle ${INK} ${className}`} style={{ height: ROW }}>
      {name && <input type="hidden" name={name} value={options[value]} />}
      <motion.button
        ref={pill}
        type="button"
        aria-haspopup="listbox"
        disabled={disabled}
        aria-expanded={shown}
        aria-label={label}
        aria-activedescendant={shown ? `${id}-${active}` : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => hide()}
        onTouchEnd={(e) => e.preventDefault()}
        onKeyDown={keys}
        onBlur={() => live.current.mode === 'tap' && hide(true)}
        className={`ring-focus relative flex touch-none select-none items-center whitespace-nowrap bg-surface text-ink before:absolute before:-inset-y-1 before:inset-x-0 disabled:opacity-50 ${textClass}`}
        style={{ height: ROW, paddingLeft: LEFT, paddingRight: 10, filter: EDGE, borderRadius: radius, touchAction: 'none', opacity: pillO }}
      >
        <span style={{ paddingRight: RIGHT - 10 }}>{options[value]}</span>
        <span className="absolute right-[9px] text-ink-3">
          <Updown />
        </span>
      </motion.button>

      <div aria-hidden className={`pointer-events-none invisible absolute left-0 top-0 ${textClass}`}>
        {options.map((o, i) => (
          <span
            key={o}
            ref={(el) => {
              probes.current[i] = el
            }}
            className="absolute whitespace-nowrap"
          >
            {o}
          </span>
        ))}
      </div>

      {shown && (
        <Layer>
          <motion.div className={`pointer-events-none ${fill(contained).split(' ')[0]} z-50 ${INK}`} style={{ left: spot.x, top: spot.y, x, y, width, height, opacity: fade }}>
            <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[16px] shadow-[0_18px_36px_-6px_rgb(0_0_0/0.22)]" style={{ opacity: open }} />
            <div className="absolute inset-0" style={{ filter: EDGE }}>
              <motion.div
                ref={sheet}
                role="listbox"
                aria-label={label}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                className={`pointer-events-auto relative select-none bg-surface text-ink ${textClass}`}
                style={{ clipPath: clip, width, height, paddingTop: PAD, paddingBottom: PAD }}
              >
                {rows(false)}
                <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-ink text-surface" style={{ clipPath: window_, opacity: inverted, paddingTop: PAD }}>
                  {rows(true)}
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </Layer>
      )}
    </div>
  )
}
