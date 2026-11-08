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

type Props = { words: string[] };

export function RotatingWord({ words }: Props) {
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
    // Every word shares one cell, so the slot fits the longest
    <span className="inline-grid text-left whitespace-pre">
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
