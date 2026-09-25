import {
  AnimatePresence,
  motion,
  stagger,
  useReducedMotion,
} from "motion/react";
import { useEffect, useState } from "react";

const letter = {
  hidden: { opacity: 0, y: "0.4em", filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

export function RotatingWord({ words }: { words: string[] }) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % words.length),
      2800,
    );
    return () => clearInterval(timer);
  }, [reduceMotion, words.length]);

  if (reduceMotion) return <span>{words[0]}</span>;

  return (
    // Animating the width keeps the centered heading from jumping
    <motion.span layout className="inline-block whitespace-pre">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={words[index]}
          className="inline-block"
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ delayChildren: stagger(0.03) }}
        >
          {[...words[index]!].map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              variants={letter}
              transition={{ duration: 0.25 }}
            >
              {char}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}
