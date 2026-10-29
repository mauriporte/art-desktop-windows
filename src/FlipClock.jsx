import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

function Digit({ d, big }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-card ${big ? 'h-24 w-16 text-7xl' : 'h-6 w-4 text-base rounded'} font-semibold`}
      style={{ perspective: 400 }}>
      <AnimatePresence initial={false}>
        <motion.div key={d} className="absolute inset-0 flex items-center justify-center"
          initial={{ rotateX: -90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: 90, opacity: 0 }}
          transition={{ duration: 0.35 }}>
          {d}
        </motion.div>
      </AnimatePresence>
      {/* the flip-clock seam */}
      <div className="absolute left-0 right-0 top-1/2 h-px bg-ink/80" />
    </div>
  )
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t) }, [ms])
  return now
}

export default function FlipClock({ big = false }) {
  const now = useNow()
  const [h, m] = [now.getHours(), now.getMinutes()].map((n) => String(n).padStart(2, '0'))
  return (
    <div className={`flex items-center ${big ? 'gap-2' : 'gap-0.5'}`}>
      <Digit d={h[0]} big={big} /><Digit d={h[1]} big={big} />
      <span className={`${big ? 'text-5xl mx-1' : 'text-sm'} text-accent`}>:</span>
      <Digit d={m[0]} big={big} /><Digit d={m[1]} big={big} />
    </div>
  )
}
