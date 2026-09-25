import { Upload } from "lucide-react";
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
      className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? "border-primary bg-muted" : "border-border"}`}
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
      <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-muted">
        <Upload className="size-5 text-muted-foreground" />
      </div>
      <p className="font-medium">Drop your site here</p>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        A folder, a zip, or an HTML file
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
