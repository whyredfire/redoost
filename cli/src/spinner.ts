const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Where a spinner draws, like process.stderr. */
export interface Output {
  isTTY?: boolean;
  write: (text: string) => boolean;
}

/**
 * Animates a status line until stop(), redrawing it as it's updated. Outside a
 * terminal the status is printed once, and when quiet, as with --json, not at all.
 */
export const spinner = (
  text: string,
  quiet: boolean,
  out: Output = process.stderr
) => {
  const animated = !quiet && out.isTTY === true;
  let shown = text;
  let frame = 0;

  const draw = () => {
    if (animated) {
      out.write(`\r\u001B[K${frames[frame % frames.length]} ${shown}`);
      frame += 1;
    }
  };

  if (!quiet && !animated) {
    out.write(`${text}…\n`);
  }

  draw();
  const timer = animated ? setInterval(draw, 80) : undefined;

  return {
    update: (next: string) => {
      shown = next;
      draw();
    },
    stop: () => {
      clearInterval(timer);

      if (animated) {
        out.write("\r\u001B[K");
      }
    },
  };
};

/** Runs work under a spinner, which it can update, clearing it however work ends. */
export const spinning = async <T>(
  text: string,
  quiet: boolean,
  work: (update: (text: string) => void) => Promise<T>
) => {
  const status = spinner(text, quiet);

  try {
    return await work(status.update);
  } finally {
    status.stop();
  }
};
