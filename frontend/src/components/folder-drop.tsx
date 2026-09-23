import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { droppedFiles, pickedFiles, type SiteFile } from "@/lib/site-files";

type Props = {
  disabled: boolean;
  onFiles: (files: SiteFile[]) => void;
  onError: (message: string) => void;
};

export function FolderDrop({ disabled, onFiles, onError }: Props) {
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(!disabled);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={async (event) => {
        event.preventDefault();
        setDragging(false);
        if (disabled) return;
        try {
          const files = await droppedFiles(event.dataTransfer.items);
          onFiles(files);
        } catch (error) {
          onError(error instanceof Error ? error.message : String(error));
        }
      }}
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Drop one folder here, or choose it from your device.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={() => input.current?.click()}
        disabled={disabled}
      >
        Choose folder
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        webkitdirectory=""
        className="sr-only"
        aria-label="Choose a site folder"
        onChange={(event) => {
          if (event.currentTarget.files) {
            onFiles(pickedFiles(event.currentTarget.files));
          }
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
