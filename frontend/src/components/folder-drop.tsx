import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { droppedFiles, pickedFiles, type SiteFile } from "@/lib/site-files";

type Props = {
  disabled: boolean;
  onFiles: (files: SiteFile[]) => void;
  onError: (message: string) => void;
};

export function FolderDrop({ disabled, onFiles, onError }: Props) {
  const [dragging, setDragging] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  async function select(read: () => SiteFile[] | Promise<SiteFile[]>) {
    try {
      const files = await read();
      onFiles(files);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  }

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const { files } = event.currentTarget;
    if (files) void select(() => pickedFiles(files));
    event.currentTarget.value = "";
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(!disabled);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (disabled) return;
        const { items } = event.dataTransfer;
        void select(() => droppedFiles(items));
      }}
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Drop a folder or files here, or choose them from your device.
      </p>
      <div className="flex justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => folderInput.current?.click()}
          disabled={disabled}
        >
          Choose folder
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => filesInput.current?.click()}
          disabled={disabled}
        >
          Choose files
        </Button>
      </div>
      <input
        ref={folderInput}
        type="file"
        multiple
        webkitdirectory=""
        className="sr-only"
        aria-label="Choose a site folder"
        onChange={pick}
      />
      <input
        ref={filesInput}
        type="file"
        multiple
        className="sr-only"
        aria-label="Choose site files"
        onChange={pick}
      />
    </div>
  );
}
