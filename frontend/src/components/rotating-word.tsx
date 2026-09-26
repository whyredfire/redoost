import {
  AnimatePresence,
  motion,
  stagger,
  useReducedMotion,
} from "motion/react";
import { cn } from "cn";
import { useEffect, useState } from "react";

const letter = {
  hidden: { opacity: 0, y: "0.4em", filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

type Props = { words: string[]; className?: string };

export function RotatingWord({ words, className }: Props) {
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
    // Every word sits invisibly in one cell, so the slot is as wide as the
    // longest and the centered heading never moves
    <span className={cn("inline-grid text-left whitespace-pre", className)}>
      {words.map((word) => (
        <span key={word} className="invisible col-start-1 row-start-1">
          {word}
        </span>
      ))}
      <span className="col-start-1 row-start-1">
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
      </span>
    </span>
  );
}
