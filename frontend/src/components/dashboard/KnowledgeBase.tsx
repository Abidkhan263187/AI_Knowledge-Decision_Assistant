import type { Doc } from "@/lib/common";

export function KnowledgeBase({
  docs,
  uploading,
  limits,
  onUpload,
  onRemove,
}: {
  docs: Doc[];
  uploading: boolean;
  limits?: { maxDocuments: number; maxPages: number; maxBytes: number };
  onUpload: (file: File) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Knowledge base</h2>
          <p className="text-sm text-slate-600">
            Max {limits?.maxDocuments ?? 10} PDFs, {limits?.maxPages ?? 1000} pages,{" "}
            {Math.round((limits?.maxBytes ?? 10 * 1024 * 1024) / (1024 * 1024))} MB each.
          </p>
        </div>
        <label className="cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          {uploading ? "Uploading…" : "Upload PDF"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <ul className="mt-4 divide-y divide-slate-100">
        {docs.length === 0 && <li className="py-3 text-slate-500">No documents yet.</li>}
        {docs.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{doc.filename}</p>
              <p className="text-xs text-slate-500">
                {doc.pageCount} pages · {(doc.sizeBytes / 1024).toFixed(1)} KB · {doc.chunkCount} chunks
              </p>
            </div>
            <button onClick={() => onRemove(doc.id)} className="text-sm text-red-600">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
