export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const notched = (x: number, centres: number[], reach: number, hold = 0.7) => {
  for (const c of centres) {
    const d = (x - c) / reach
    if (Math.abs(d) < 1) return x - ((hold * reach) / Math.PI) * Math.sin(Math.PI * d) * ((1 + Math.cos(Math.PI * d)) / 2)
  }
  return x
}

export const feedback = (() => {
  let audio: AudioContext | null = null
  let last = 0
  let asked = false
  let on = true
  let cancel: (() => void) | null = null
  let holding = false
  const open = () => {
    cancel = null
    audio ??= new AudioContext()
    if (asked && audio.state === 'suspended') void audio.resume()
  }
  const warm = () => {
    if (!on || audio || cancel || holding || typeof AudioContext === 'undefined') return
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(open, { timeout: 300 })
      cancel = () => cancelIdleCallback(id)
    } else {
      const id = setTimeout(open, 60)
      cancel = () => clearTimeout(id)
    }
  }
  const letGo = () => {
    holding = false
    removeEventListener('pointerup', letGo)
    removeEventListener('pointercancel', letGo)
    warm()
  }
  const play = (heavy: boolean, loud: number) => {
    if (!audio) return
    const t = audio.currentTime
    const tone = audio.createOscillator()
    const gain = audio.createGain()
    tone.frequency.setValueAtTime(heavy ? 900 : 1500, t)
    tone.frequency.exponentialRampToValueAtTime(heavy ? 240 : 420, t + 0.014)
    gain.gain.setValueAtTime((heavy ? 0.034 : 0.02) * loud, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.03 : 0.016))
    tone.connect(gain).connect(audio.destination)
    tone.start(t)
    tone.stop(t + 0.034)
  }
  return {
    set(next: boolean) {
      on = next
      if (on) return
      cancel?.()
      cancel = null
      void audio?.suspend()
    },
    warm,
    wake(grab = false) {
      if (!on) return
      asked = true
      if (audio) {
        if (audio.state === 'suspended') void audio.resume()
      } else if (!grab) warm()
      else if (!holding && typeof AudioContext !== 'undefined') {
        cancel?.()
        cancel = null
        holding = true
        addEventListener('pointerup', letGo)
        addEventListener('pointercancel', letGo)
      }
    },
    tick(heavy = false, speed = 1) {
      if (!on || !asked) return
      const now = performance.now()
      if (now - last < 34) return
      last = now
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(heavy ? 10 : 4)
      if (!audio) return
      const loud = 0.45 + 0.55 * clamp(speed, 0, 1)
      if (audio.state === 'running') play(heavy, loud)
      else void audio.resume().then(() => on && play(heavy, loud))
    },
  }
})()
