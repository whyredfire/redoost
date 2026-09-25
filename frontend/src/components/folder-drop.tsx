import { Upload } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { pickedFiles, type SiteFile } from "@/lib/site-files";

type Props = {
  dragging: boolean;
  disabled: boolean;
  onFiles: (files: SiteFile[]) => void;
  onError: (message: string) => void;
};

// Drops are handled page-wide by the publish card; this is the visible target
export function FolderDrop({ dragging, disabled, onFiles, onError }: Props) {
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (!input.files) return;
    try {
      const selected = await pickedFiles(input.files);
      onFiles(selected);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      // Clearing it empties input.files, so only once they've been read
      input.value = "";
    }
  }

  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${dragging ? "border-primary bg-muted" : "border-border"}`}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <Upload className="size-5 text-muted-foreground" />
      </div>
      <p className="text-lg font-medium">
        {dragging ? "Drop to upload" : "Drop your site anywhere on this page"}
      </p>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
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
