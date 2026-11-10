import { AnimatePresence, motion } from 'motion/react'
import { ease, spring, dur } from '@/components/detent/lib/motion'

export type Sheet = { id: string; name: string }

const FW = 224
const FH = 168
const PLACEHOLDERS = ['p1', 'p2']

const hash = (s: string) => Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))

function UploadIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 14.5v2.3A3.2 3.2 0 0 0 7.2 20h9.6a3.2 3.2 0 0 0 3.2-3.2v-2.3" />
      <path d="M12 15V7" />
      <path d="M12 3.2 7.6 8.2h8.8z" fill="currentColor" />
    </svg>
  )
}

export function Folder({ open, sheets = [], pct = 0, busy = false }: { open: boolean; sheets?: Sheet[]; pct?: number; busy?: boolean }) {
  const shown = sheets.slice(0, 4).reverse()
  const papers: { id: string; sheet?: Sheet }[] = shown.length ? shown.map((s) => ({ id: s.id, sheet: s })) : PLACEHOLDERS.map((id) => ({ id }))
  return (
    <div aria-hidden className="relative shrink-0" style={{ width: FW, height: FH, perspective: 720 }}>
      <div className="absolute left-0 top-0 h-[30px] w-[96px] bg-[var(--folder-back)]" style={{ borderRadius: '14px 14px 0 0', clipPath: 'polygon(0 0, 78% 0, 100% 100%, 0 100%)' }} />
      <div className="absolute inset-x-0 bottom-0 top-[22px] rounded-[18px] bg-[var(--folder-back)]" style={{ boxShadow: 'inset 0 -12px 24px -16px rgb(0 0 0 / 0.25)' }} />

      <AnimatePresence initial={false}>
        {papers.map((p, k) => {
          const h = hash(p.id)
          const rot = ((h % 7) - 3) * 1.4
          const dx = ((h % 5) - 2) * 3
          const depth = papers.length - 1 - k
          return (
            <motion.div
              key={p.id}
              className="absolute left-1/2 top-[36px] flex flex-col overflow-hidden rounded-[10px] bg-[var(--sheet)] p-1.5"
              style={{ width: 172, height: 112, marginLeft: -86, boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.6), 0 4px 10px -4px rgb(0 0 0 / 0.22)' }}
              initial={p.sheet ? { y: -150, rotate: rot * 3, opacity: 0, scale: 0.92 } : false}
              animate={{ y: (open ? -16 : 0) - depth * 6, x: dx, rotate: rot, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -20, transition: { duration: dur.exit, ease: ease.out } }}
              transition={{ ...spring.soft, delay: p.sheet ? k * 0.08 : 0 }}
            >
              {p.sheet ? <SheetFace name={p.sheet.name} /> : <span className="flex-1 rounded-[7px] bg-[var(--sheet-line)] opacity-60" />}
            </motion.div>
          )
        })}
      </AnimatePresence>

      <motion.div
        className="absolute inset-x-0 bottom-0 h-[112px] rounded-[18px] bg-[var(--folder-front)]"
        style={{ transformOrigin: '50% 100%', boxShadow: 'inset 0 1px 0 light-dark(rgb(255 255 255 / 0.55), transparent), inset 0 0 0 1px light-dark(transparent, rgb(255 255 255 / 0.145)), 0 -8px 20px -12px rgb(0 0 0 / 0.25)' }}
        animate={{ rotateX: open ? -30 : 0 }}
        transition={open ? spring.soft : spring.pop}
      >
        <motion.div className="pointer-events-none absolute inset-0 rounded-[18px] bg-black" initial={false} animate={{ opacity: open ? 0.08 : 0 }} transition={{ duration: 0.3, ease: ease.out }} />
        <div className="absolute inset-x-0 top-[34px] flex justify-center text-[var(--folder-ink)]">
          <motion.span animate={{ y: open ? -3 : 0 }} transition={spring.snappy}>
            <UploadIcon />
          </motion.span>
        </div>
        <AnimatePresence>
          {busy && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: dur.exit, ease: ease.out, delay: dur.enter } }}
              className="absolute inset-x-6 bottom-5 h-[4px] overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.1]"
              transition={{ duration: dur.enter, ease: ease.out }}
            >
              <motion.div className="h-full rounded-full bg-[var(--folder-ink)]" initial={false} animate={{ width: `${pct}%` }} transition={spring.release} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function SheetFace({ name }: { name: string }) {
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  return (
    <>
      <span
        className="flex h-[62px] items-center justify-center rounded-[7px] text-[10px] font-semibold tracking-[0.06em] text-[var(--folder-ink)]"
        style={{ background: 'color-mix(in oklch, var(--sheet-line) 55%, var(--sheet))' }}
      >
        {ext.toUpperCase()}
      </span>
      <span className="mt-1.5 truncate px-0.5 text-caption font-medium text-ink-2">{name}</span>
      <span className="mt-1 h-[3px] w-1/2 rounded-full bg-[var(--sheet-line)]" />
    </>
  )
}
