import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

export type PhraseChoice = { id: string; options: string[]; label?: string }
export type PhraseNumber = { id: string; label: string; min: number; max: number; step?: number; format?: (n: number) => string }
export type PhrasePart = string | PhraseChoice | PhraseNumber
export type PhraseValues = Record<string, string | number>

const EASE = [0.3, 0, 0.2, 1] as const
const MUTE = 'text-[color-mix(in_oklch,var(--ink)_42%,transparent)]'
const PX = 7
const MENU = 'absolute top-[calc(100%+8px)] z-30 rounded-[12px] bg-[light-dark(#ffffff,#26262a)] p-1 text-[13.5px] leading-normal tracking-normal shadow-[0_0_0_0.5px_light-dark(rgb(0_0_0/.14),rgb(255_255_255/.12)),0_2px_4px_rgb(0_0_0/.04),0_16px_36px_-12px_rgb(0_0_0/.25)]'
const MARK = 'ring-focus relative -mx-1 rounded-[6px] px-1 text-ink underline decoration-dotted decoration-[1.5px] underline-offset-[5px] transition-colors ease-detent'
const OPEN = 'bg-[light-dark(rgb(0_0_0/.05),rgb(255_255_255/.08))] decoration-transparent'
const SHUT = 'decoration-[color-mix(in_oklch,var(--ink)_30%,transparent)] hover:decoration-[color-mix(in_oklch,var(--ink)_70%,transparent)]'

const isChoice = (p: PhrasePart): p is PhraseChoice => typeof p !== 'string' && 'options' in p

function useOutside(open: boolean, box: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    const off = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [open, box, close])
}

const fit = (base: string) => (el: HTMLElement | null) => {
  if (!el) return
  el.style.translate = `${base} 0`
  const r = el.getBoundingClientRect()
  const over = r.right - (window.innerWidth - 8)
  const under = 8 - r.left
  const dx = over > 0 ? -Math.min(over, r.left - 8) : under > 0 ? under : 0
  if (dx) el.style.translate = `calc(${base} + ${dx}px) 0`
}
const fitLeft = fit('0px')
const fitMiddle = fit('-50%')

function Word({ part, value, onPick, reduce }: { part: PhraseChoice; value: string; onPick: (v: string) => void; reduce: boolean }) {
  const at = Math.max(0, part.options.indexOf(value))
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(at)
  const [w, setW] = useState<number | null>(null)
  const box = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const sizer = useRef<HTMLSpanElement>(null)
  const [close] = useState(() => () => setOpen(false))
  useOutside(open, box, close)

  useLayoutEffect(() => {
    const el = sizer.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.offsetWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pick = (n: number) => {
    onPick(part.options[n]!)
    setOpen(false)
    btn.current?.focus()
  }

  const onKey = (e: KeyboardEvent) => {
    const last = part.options.length
    if (!open) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      setHi(at)
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') setHi((h) => (h + 1) % last)
    else if (e.key === 'ArrowUp') setHi((h) => (h - 1 + last) % last)
    else if (e.key === 'Home') setHi(0)
    else if (e.key === 'End') setHi(last - 1)
    else if (e.key === 'Enter' || e.key === ' ') pick(hi)
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false)
      if (e.key === 'Tab') return
    } else return
    e.preventDefault()
  }

  return (
    <span ref={box} className="relative inline-block">
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={part.label ? `${part.label}: ${part.options[at]}` : undefined}
        onClick={() => {
          setHi(at)
          setOpen((o) => !o)
        }}
        onKeyDown={onKey}
        className={`${MARK} ${open ? OPEN : SHUT}`}
      >
        <span ref={sizer} aria-hidden className="invisible absolute whitespace-nowrap">
          {part.options[at]}
        </span>
        <motion.span className="relative inline-block whitespace-nowrap align-bottom [overflow-x:clip]" initial={false} animate={{ width: w ?? 'auto' }} transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={at}
              className="inline-block"
              initial={reduce ? false : { opacity: 0, y: 8, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduce ? undefined : { opacity: 0, y: -8, filter: 'blur(3px)' }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              {part.options[at]}
            </motion.span>
          </AnimatePresence>
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            ref={fitLeft}
            role="listbox"
            aria-label={part.label ?? part.id}
            className={`${MENU} left-[-10px] min-w-[190px]`}
            style={{ transformOrigin: '24px 0' }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -2, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            {part.options.map((o, n) => (
              <li
                key={o}
                role="option"
                aria-selected={n === at}
                onPointerEnter={() => setHi(n)}
                onClick={() => pick(n)}
                className={`flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap rounded-[8px] px-2.5 pointer-coarse:h-10 ${n === hi ? 'bg-[light-dark(rgb(0_0_0/.045),rgb(255_255_255/.07))] text-ink' : 'text-ink-2'}`}
              >
                <span className="flex-1">{o}</span>
                {n === at && (
                  <svg viewBox="0 0 14 14" className="size-3.5 text-ink" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m3.2 7.4 2.5 2.4 5.1-5.6" />
                  </svg>
                )}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </span>
  )
}

function Roll({ text, dir, reduce }: { text: string; dir: number; reduce: boolean }) {
  const chars = text.split('')
  return (
    <span className="tnum relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        {chars.map((c, i) => (
          <motion.span
            key={`${chars.length - i}-${c}`}
            custom={dir}
            className="inline-block"
            variants={{ in: (d: number) => ({ y: reduce ? 0 : d > 0 ? '70%' : '-70%', opacity: 0 }), at: { y: 0, opacity: 1 }, out: (d: number) => ({ y: reduce ? 0 : d > 0 ? '-70%' : '70%', opacity: 0 }) }}
            initial="in"
            animate="at"
            exit="out"
            transition={{ duration: 0.22, ease: EASE }}
          >
            {c}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  )
}

function Dial({ part, value, onChange, reduce }: { part: PhraseNumber; value: number; onChange: (n: number) => void; reduce: boolean }) {
  const { min, max, step = 1, label } = part
  const [dir, setDir] = useState(1)
  const [held, setHeld] = useState(false)
  const [open, setOpen] = useState(false)
  const from = useRef({ x: 0, v: 0, moved: false })
  const box = useRef<HTMLSpanElement>(null)
  const [close] = useState(() => () => setOpen(false))
  useOutside(open, box, close)

  const set = (n: number) => {
    const c = Math.min(max, Math.max(min, Math.round(n / step) * step))
    if (c === value) return
    setDir(c > value ? 1 : -1)
    onChange(c)
  }

  const down = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    from.current = { x: e.clientX, v: value, moved: false }
    setHeld(true)
  }
  const move = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!held) return
    if (Math.abs(e.clientX - from.current.x) > 3) from.current.moved = true
    set(from.current.v + Math.round((e.clientX - from.current.x) / PX) * step)
  }
  const up = () => {
    setHeld(false)
    if (!from.current.moved) setOpen((o) => !o)
  }

  const onKey = (e: KeyboardEvent) => {
    const big = e.shiftKey ? 10 : 1
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') set(value + step * big)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') set(value - step * big)
    else if (e.key === 'Home') set(min)
    else if (e.key === 'End') set(max)
    else if (e.key === 'Escape') setOpen(false)
    else return
    e.preventDefault()
  }

  const shown = part.format ? part.format(value) : value.toLocaleString('en-US')

  const nudge = (d: number) => (
    <motion.button
      type="button"
      whileTap={reduce ? undefined : { scale: 0.92 }}
      aria-label={d < 0 ? `Less ${label.toLowerCase()}` : `More ${label.toLowerCase()}`}
      disabled={d < 0 ? value <= min : value >= max}
      onClick={() => set(value + d * step)}
      className="ring-focus grid size-8 place-items-center rounded-[8px] text-ink-2 hover:bg-[light-dark(rgb(0_0_0/.045),rgb(255_255_255/.07))] hover:text-ink disabled:opacity-30 pointer-coarse:size-10"
    >
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d={d < 0 ? 'M3 6h6' : 'M3 6h6M6 3v6'} />
      </svg>
    </motion.button>
  )

  return (
    <span ref={box} className="relative inline-block">
      <span
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuetext={shown}
        aria-valuemin={min}
        aria-valuemax={max}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setHeld(false)}
        onKeyDown={onKey}
        className={`${MARK} inline-block cursor-ew-resize touch-none select-none ${held || open ? OPEN : SHUT}`}
      >
        <Roll text={shown} dir={dir} reduce={reduce} />
      </span>
      <AnimatePresence>
        {open && (
          <motion.span
            ref={fitMiddle}
            className={`${MENU} left-1/2 flex items-center gap-1`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -2, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            {nudge(-1)}
            <span className="tnum min-w-[56px] text-center text-[13px] text-ink">{shown}</span>
            {nudge(1)}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

const first = (parts: PhrasePart[]) =>
  Object.fromEntries(parts.filter((p) => typeof p !== 'string').map((p) => [p.id, isChoice(p) ? p.options[0] : p.min])) as PhraseValues

export function Phrase({
  parts,
  value,
  defaultValue,
  onChange,
  title,
  aside,
  says,
  className = '',
}: {
  parts: PhrasePart[]
  value?: PhraseValues
  defaultValue?: PhraseValues
  onChange?: (values: PhraseValues) => void
  title?: ReactNode
  aside?: ReactNode
  says?: (values: PhraseValues) => ReactNode
  className?: string
}) {
  const reduce = !!useReducedMotion()
  const [own, setOwn] = useState<PhraseValues>(() => ({ ...first(parts), ...defaultValue }))
  const values = value ? { ...own, ...value } : own
  const set = (id: string) => (v: string | number) => {
    const next = { ...values, [id]: v }
    if (!value) setOwn(next)
    onChange?.(next)
  }
  const line = says?.(values)
  const lineKey = parts
    .filter((p) => typeof p !== 'string')
    .map((p) => values[p.id])
    .join('|')

  const sentence = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number | 'auto'>('auto')
  const [moving, setMoving] = useState(false)
  useLayoutEffect(() => {
    const el = sentence.current
    if (!el) return
    const ro = new ResizeObserver(() => setH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <section className={`w-full rounded-[16px] bg-[light-dark(#ffffff,#1a1a1c)] p-1 shadow-[0_0_0_0.5px_light-dark(rgb(0_0_0/.12),rgb(255_255_255/.1)),0_1px_2px_rgb(0_0_0/.04),0_12px_32px_-20px_rgb(0_0_0/.22)] ${className}`}>
      {(title || aside) && (
        <header className="flex h-10 items-center gap-2 px-4">
          {title && <h3 className="text-[13px] font-medium text-ink-2">{title}</h3>}
          <span className="flex-1" />
          {aside && <span className={`text-[12.5px] ${MUTE}`}>{aside}</span>}
        </header>
      )}
      <div className="rounded-[12px] bg-[light-dark(#f6f6f5,#222225)] px-4">
        <motion.div
          className={moving ? 'overflow-hidden' : ''}
          onAnimationStart={() => setMoving(true)}
          onAnimationComplete={() => setMoving(false)}
          initial={false}
          animate={{ height: h }}
          transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE }}
        >
          <div ref={sentence} className={`py-5 text-[19px] leading-[1.6] tracking-[-0.022em] ${MUTE}`}>
            {parts.map((p, n) =>
              typeof p === 'string' ? (
                <Fragment key={n}>{p}</Fragment>
              ) : isChoice(p) ? (
                <Word key={p.id} part={p} value={String(values[p.id])} onPick={set(p.id)} reduce={reduce} />
              ) : (
                <Dial key={p.id} part={p} value={Number(values[p.id])} onChange={set(p.id)} reduce={reduce} />
              ),
            )}
          </div>
        </motion.div>
        {says && (
          <div aria-live="polite" className="flex min-h-10 items-center overflow-hidden text-[12.5px] shadow-[inset_0_1px_0_light-dark(rgb(0_0_0/.07),rgb(255_255_255/.07))]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={lineKey}
                className="tnum py-2.5 text-ink-3"
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                {line}
              </motion.span>
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  )
}
