export const ease = {
  out: [0.2, 0.9, 0.25, 1] as const,
  inOut: [0.6, 0, 0.3, 1] as const,
}

export const dur = {
  exit: 0.12,
  hover: 0.15,
  enter: 0.2,
  swap: 0.24,
  panel: 0.34,
}

export const spring = {
  snappy: { type: 'spring', stiffness: 560, damping: 42, mass: 0.6 } as const,
  smooth: { type: 'spring', bounce: 0, duration: 0.36 } as const,
  soft: { type: 'spring', bounce: 0.12, duration: 0.5 } as const,
  release: { type: 'spring', stiffness: 320, damping: 32 } as const,
  move: { type: 'spring', stiffness: 420, damping: 38 } as const,
  data: { type: 'spring', stiffness: 170, damping: 26 } as const,
  pop: { type: 'spring', bounce: 0.3, duration: 0.4 } as const,
}

export const appear = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: dur.swap, ease: ease.out } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: dur.exit, ease: ease.out } },
}

export const slide = {
  enter: (dir: number) => ({ x: dir * 24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -24, opacity: 0 }),
}

export const press = { scale: 0.97 }

export const staggerFor = (count: number) => Math.min(0.04, 0.2 / Math.max(1, count))
