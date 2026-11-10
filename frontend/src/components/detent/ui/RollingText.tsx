import { useLayoutEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue } from 'motion/react'

const roll = { type: 'spring', stiffness: 380, damping: 34, mass: 0.8 } as const

export function RollingText({ text, className = '', proportional = false, still = false }: { text: string; className?: string; proportional?: boolean; still?: boolean }) {
  const chars = [...text]
  const probe = useRef<HTMLSpanElement>(null)
  const [widths, setWidths] = useState<number[] | null>(null)

  useLayoutEffect(() => {
    if (!proportional || !probe.current) return
    const read = () => {
      const box = probe.current!
      const z = box.offsetWidth ? box.getBoundingClientRect().width / box.offsetWidth : 1
      const em = parseFloat(getComputedStyle(box).fontSize) || 16
      setWidths([...box.children].map((c) => (c as HTMLElement).getBoundingClientRect().width / z / em))
    }
    read()
    document.fonts?.ready.then(read)
  }, [proportional])

  return (
    <span className={`relative inline-flex ${proportional ? '' : 'tnum'} ${className}`} style={{ lineHeight: '1.25em', height: '1.25em' }}>
      <span className="sr-only">{text}</span>
      {proportional && (
        <span aria-hidden className="pointer-events-none absolute left-0 top-0 size-0 overflow-hidden">
          <span ref={probe} className="invisible flex w-max whitespace-pre">
            {Array.from({ length: 10 }, (_, n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      )}
      {chars.map((c, i) => {
        const key = chars.length - i
        return /\d/.test(c) ? (
          <Digit key={key} d={+c} width={proportional && widths ? widths[+c] : undefined} still={still} />
        ) : (
          <span key={`${key}${c}`} aria-hidden className="whitespace-pre">
            {c}
          </span>
        )
      })}
    </span>
  )
}

function Digit({ d, width, still }: { d: number; width?: number; still: boolean }) {
  const w = useMotionValue<string>(width === undefined ? '1ch' : `${width}em`)
  const had = useRef(width !== undefined)
  useLayoutEffect(() => {
    if (width === undefined) return
    if (!had.current) {
      had.current = true
      w.set(`${width}em`)
      return
    }
    const ctl = animate(w, `${width}em`, roll)
    return () => ctl.stop()
  }, [width, w])

  return (
    <motion.span aria-hidden className="relative inline-block overflow-hidden" style={{ height: '1.25em', width: w }}>
      <motion.span className="absolute inset-x-0 top-0 flex flex-col items-center" initial={false} animate={{ y: `${-d * 10}%` }} transition={still ? { duration: 0 } : roll}>
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="block" style={{ height: '1.25em' }}>
            {n}
          </span>
        ))}
      </motion.span>
    </motion.span>
  )
}
