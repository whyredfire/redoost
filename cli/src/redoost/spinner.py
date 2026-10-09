import itertools
import sys
import threading

frames = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"


class Spinner:
    """Animates a status line on stderr while work runs."""

    def __init__(self, text: str, quiet: bool) -> None:
        self.text = text
        # Only terminals can redraw a line; elsewhere the status is printed once
        self.animated = not quiet and sys.stderr.isatty()
        if not quiet and not self.animated:
            print(f"{text}…", file=sys.stderr)
        self.done = threading.Event()
        self.thread = threading.Thread(target=self.spin, daemon=True)

    def update(self, text: str) -> None:
        self.text = text

    def spin(self) -> None:
        for frame in itertools.cycle(frames):
            sys.stderr.write(f"\r\033[K{frame} {self.text}")
            sys.stderr.flush()
            if self.done.wait(0.08):
                break
        sys.stderr.write("\r\033[K")
        sys.stderr.flush()

    def __enter__(self) -> None:
        if self.animated:
            self.thread.start()

    def __exit__(self, *exc_info: object) -> None:
        self.done.set()
        if self.animated:
            self.thread.join()
