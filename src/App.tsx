import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Download, NotebookPen, Pin, Plus, Trash2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import { dragWindow, WindowControls } from "./components/WindowControls";

// Same shape as `Note` in src-tauri/src/notes.rs (serde keeps the snake_case names)
type Note = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

const fail = (err: unknown) => toast.error(String(err));

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textoBusca, setTextoBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  // One pending save per note, so switching notes mid-typing never drops the previous save
  const saveTimers = useRef(new Map<string, number>());

  useEffect(() => {
    invoke<Note[]>("list_notes")
      .then((loaded) => {
        setNotes(loaded);
        setSelectedId(newestFirst(loaded)[0]?.id ?? null);
      })
      .catch(fail)
      .finally(() => invoke("close_splash"));
  }, []);

  // Ctrl+N creates a note. No dependency array: re-subscribes every render, so it always calls the
  // latest createNote (which reads categoriaFiltro). The cleanup removes the previous listener.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key.toLowerCase() === "n") {
        e.preventDefault(); // WebView2 would otherwise open a new window
        createNote();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const sorted = newestFirst(notes);
  const busca = textoBusca.toLowerCase();
  const filtered = sorted.filter((item) => {
    if (categoriaFiltro && item.category !== categoriaFiltro) return false;
    return item.title.toLowerCase().includes(busca) || item.content.toLowerCase().includes(busca);
  });
  // Categories are just the distinct names used by notes
  const categorias = [...new Set(notes.map((n) => n.category).filter((c) => c !== null))].sort();
  const selected = notes.find((n) => n.id === selectedId);
  const texto = selected?.content.trim() ?? "";
  const palavras = texto.split(/\s+/).filter(Boolean).length;

  async function createNote() {
    const now = new Date().toISOString();
    const note: Note = { id: crypto.randomUUID(), title: "", content: "", category: categoriaFiltro, pinned: false, created_at: now, updated_at: now };
    try {
      await invoke("save_note", { note });
      setNotes((ns) => [...ns, note]);
      setSelectedId(note.id);
    } catch (err) {
      fail(err);
    }
  }

  function editNote(patch: Partial<Pick<Note, "title" | "content" | "category" | "pinned">>) {
    if (!selected) return;
    const note = { ...selected, ...patch, updated_at: new Date().toISOString() };
    setNotes((ns) => ns.map((n) => (n.id === note.id ? note : n)));

    // Debounce: write to disk 400ms after the user stops typing
    clearTimeout(saveTimers.current.get(note.id));
    saveTimers.current.set(
      note.id,
      window.setTimeout(() => {
        saveTimers.current.delete(note.id);
        invoke("save_note", { note }).catch(fail);
      }, 400),
    );
  }

  async function exportNote(note: Note) {
    try {
      if (await invoke<boolean>("export_note", { title: note.title, content: note.content })) toast.success("Nota exportada");
    } catch (err) {
      fail(err);
    }
  }

  async function deleteNote(note: Note) {
    const ok = await ask(`Apagar "${note.title || "Sem título"}"?`, { title: "will-notes", kind: "warning" });
    if (!ok) return;
    clearTimeout(saveTimers.current.get(note.id));
    try {
      await invoke("delete_note", { id: note.id });
      setNotes((ns) => ns.filter((n) => n.id !== note.id));
      if (selectedId === note.id) setSelectedId(null);
    } catch (err) {
      fail(err);
    }
  }
  
  return (
    <div className="flex h-screen flex-col">
      <nav onMouseDown={dragWindow} className="flex h-10 shrink-0 items-end gap-1 border-b bg-sidebar pl-2 select-none">
        <button
            aria-label="Início"
            title="Início"
            onClick={() => setSelectedId(null)}
            className="mr-2 grid size-7 shrink-0 place-items-center self-center rounded-md bg-primary/15 text-primary transition-shadow hover:shadow-[0_0_18px_var(--glow)]"
          >
            <NotebookPen size={18} />
          </button>
        <div onMouseDown={dragWindow} className="min-w-6 flex-1 self-stretch"></div>
        <div className="my-2.5 ml-2 w-px self-stretch bg-border" />
        <WindowControls />
      </nav>
      <div className="flex min-h-0 flex-1 bg-background text-foreground">
        <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          <header className="flex items-center justify-between p-3">
            
            <button onClick={createNote} title="Nova nota" className="rounded p-1.5 hover:bg-muted">
              <Plus size={18} />
            </button>
          </header>
          <input 
          value={textoBusca}
          placeholder="Pesquise o nome da nota"
          onChange={(e) => setTextoBusca( e.target.value )}
          className="mx-2 mb-2 rounded border border-input bg-transparent px-2 py-1 text-sm outline-none focus:border-ring"
          type="text" />
          {categorias.length > 0 && (
            <div className="mx-2 mb-2 flex flex-wrap gap-1">
              {[null, ...categorias].map((c) => (
                <button
                  key={c ?? ""}
                  onClick={() => setCategoriaFiltro(c)}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    c === categoriaFiltro ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {c ?? "Todas"}
                </button>
              ))}
            </div>
          )}
          <ul className="flex-1 overflow-y-auto px-2 pb-2">
            {filtered.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => setSelectedId(n.id)}
                  className={`w-full rounded px-2 py-1.5 text-left ${
                    n.id === selectedId ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-1 truncate text-sm font-medium">
                    {n.pinned && <Pin size={12} className="shrink-0 text-primary" />}
                    {n.title || "Sem título"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{n.content.split("\n")[0] || "Vazia"}</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {selected ? (
          <main className="flex flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-border p-3">
              <input
                value={selected.title}
                onChange={(e) => editNote({ title: e.target.value })}
                placeholder="Título"
                className="flex-1 bg-transparent text-xl font-semibold outline-none"
              />
              {/* datalist = native autocomplete with the existing categories */}
              <input
                value={selected.category ?? ""}
                onChange={(e) => editNote({ category: e.target.value.trim() || null })}
                placeholder="Categoria"
                list="categorias"
                className="w-32 rounded border border-input bg-transparent px-2 py-1 text-sm outline-none focus:border-ring"
              />
              <datalist id="categorias">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <button
                onClick={() => editNote({ pinned: !selected.pinned })}
                title={selected.pinned ? "Desafixar" : "Fixar no topo"}
                className={`rounded p-1.5 hover:bg-muted ${selected.pinned ? "text-primary" : "text-muted-foreground"}`}
              >
                <Pin size={18} />
              </button>
              <button
                onClick={() => exportNote(selected)}
                title="Exportar .md"
                className="rounded p-1.5 text-muted-foreground hover:bg-muted"
              >
                <Download size={18} />
              </button>
              <button
                onClick={() => deleteNote(selected)}
                title="Apagar"
                className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={18} />
              </button>
            </div>
            <textarea
              value={selected.content}
              onChange={(e) => editNote({ content: e.target.value })}
              placeholder="Escreva aqui..."
              className="flex-1 resize-none bg-transparent p-4 leading-relaxed outline-none"
            />
            <div className="border-t border-border px-4 py-1.5 text-xs text-muted-foreground flex gap-4">
              <span>
                Caracteres: {[...texto].length}
              </span>
              <span>
                Palavras: {palavras}
              </span>
            </div>
          </main>
        ) : (
          <main className="grid flex-1 place-items-center text-muted-foreground">
            <button onClick={createNote} className="flex items-center gap-2 rounded-lg border border-dashed border-input px-4 py-2 hover:border-primary hover:text-primary">
              <Plus size={16} /> Nova nota
            </button>
          </main>
        )}

        <Toaster richColors />
      </div>
    </div>
  );
}

// Pinned first, then newest. ISO timestamps sort correctly as plain strings
const newestFirst = (ns: Note[]) =>
  [...ns].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
