import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { NotebookPen, Plus, Trash2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import "./App.css";

// Same shape as `Note` in src-tauri/src/notes.rs (serde keeps the snake_case names)
type Note = {
  id: string;
  title: string;
  content: string;
  category_id: string | null;
  created_at: string;
  updated_at: string;
};

const fail = (err: unknown) => toast.error(String(err));

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textoBusca, setTextoBusca] = useState("");
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

  const sorted = newestFirst(notes);
  const busca = textoBusca.toLowerCase();
  const filtered = sorted.filter((item) => {
    return item.title.toLowerCase().includes(busca) || item.content.toLowerCase().includes(busca);
  });
  const selected = notes.find((n) => n.id === selectedId);

  async function createNote() {
    const now = new Date().toISOString();
    const note: Note = { id: crypto.randomUUID(), title: "", content: "", category_id: null, created_at: now, updated_at: now };
    try {
      await invoke("save_note", { note });
      setNotes((ns) => [...ns, note]);
      setSelectedId(note.id);
    } catch (err) {
      fail(err);
    }
  }

  function editNote(patch: Partial<Pick<Note, "title" | "content">>) {
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
    <div className="flex h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
        <header className="flex items-center justify-between p-3">
          <span className="flex items-center gap-2 font-semibold">
            <NotebookPen size={18} className="text-violet-500" /> will-notes
          </span>
          <button onClick={createNote} title="Nova nota" className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <Plus size={18} />
          </button>
        </header>
        <input 
        value={textoBusca}
        placeholder="Pesquise o nome da nota"
        onChange={(e) => setTextoBusca( e.target.value )}
        className="mx-2 mb-2 rounded border border-zinc-200 bg-transparent px-2 py-1 text-sm outline-none focus:border-violet-500 dark:border-zinc-800"
        type="text" />
        <ul className="flex-1 overflow-y-auto px-2 pb-2">
          {filtered.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => setSelectedId(n.id)}
                className={`w-full rounded px-2 py-1.5 text-left ${
                  n.id === selectedId ? "bg-violet-100 dark:bg-violet-500/20" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                }`}
              >
                <div className="truncate text-sm font-medium">{n.title || "Sem título"}</div>
                <div className="truncate text-xs text-zinc-500">{n.content.split("\n")[0] || "Vazia"}</div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {selected ? (
        <main className="flex flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
            <input
              value={selected.title}
              onChange={(e) => editNote({ title: e.target.value })}
              placeholder="Título"
              className="flex-1 bg-transparent text-xl font-semibold outline-none"
            />
            <button
              onClick={() => deleteNote(selected)}
              title="Apagar"
              className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
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
        </main>
      ) : (
        <main className="grid flex-1 place-items-center text-zinc-500">
          <button onClick={createNote} className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-4 py-2 hover:border-violet-500 hover:text-violet-500 dark:border-zinc-700">
            <Plus size={16} /> Nova nota
          </button>
        </main>
      )}

      <Toaster richColors />
    </div>
  );
}

// ISO timestamps sort correctly as plain strings
const newestFirst = (ns: Note[]) => [...ns].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
