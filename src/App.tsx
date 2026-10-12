import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Download, NotebookPen, Pin, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Tooltip } from "radix-ui";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { Toaster, toast } from "sonner";
import { Button, ConfirmDialog, IconButton } from "./components/ui";
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
  const [toDelete, setToDelete] = useState<Note | null>(null);
  const layout = useDefaultLayout({ id: "will-notes-layout", storage: localStorage });
  // One pending save per note, so switching notes mid-typing never drops the previous save.
  // The note is kept next to its timer so pending saves can be flushed when the window closes.
  const pendingSaves = useRef(new Map<string, { timer: number; note: Note }>());

  useEffect(() => {
    invoke<Note[]>("list_notes")
      .then((loaded) => {
        setNotes(loaded);
        setSelectedId(newestFirst(loaded)[0]?.id ?? null);
      })
      .catch(fail)
      .finally(() => invoke("close_splash"));
  }, []);

  // Flush pending saves before the window closes; if one fails, keep the window open so nothing is lost
  useEffect(() => {
    const off = getCurrentWindow().onCloseRequested(async (e) => {
      const saves = [...pendingSaves.current.values()].map(({ timer, note }) => {
        clearTimeout(timer);
        return invoke("save_note", { note });
      });
      pendingSaves.current.clear();
      try {
        await Promise.all(saves);
      } catch (err) {
        e.preventDefault();
        fail(err);
      }
    });
    return () => {
      off.then((f) => f());
    };
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
    const pending = pendingSaves.current;
    clearTimeout(pending.get(note.id)?.timer);
    pending.set(note.id, {
      note,
      timer: window.setTimeout(() => {
        pending.delete(note.id);
        invoke("save_note", { note }).catch(fail);
      }, 400),
    });
  }

  async function exportNote(note: Note) {
    try {
      if (await invoke<boolean>("export_note", { title: note.title, content: note.content })) toast.success("Nota exportada");
    } catch (err) {
      fail(err);
    }
  }

  async function deleteNote(note: Note) {
    clearTimeout(pendingSaves.current.get(note.id)?.timer);
    pendingSaves.current.delete(note.id);
    try {
      await invoke("delete_note", { id: note.id });
      setNotes((ns) => ns.filter((n) => n.id !== note.id));
      if (selectedId === note.id) setSelectedId(null);
    } catch (err) {
      fail(err);
    }
  }

  return (
    // reducedMotion="user": animations turn off when Windows has "Animation effects" disabled
    <MotionConfig reducedMotion="user">
    <Tooltip.Provider delayDuration={300}>
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
      {/* Resizable sidebar; useDefaultLayout keeps the width in localStorage between sessions */}
      <Group {...layout} className="min-h-0 flex-1 bg-background text-foreground">
        <Panel id="sidebar" defaultSize={256} minSize={200} maxSize={420}>
        <aside className="flex h-full flex-col bg-sidebar">
          <header className="flex items-center justify-between py-2 pr-2 pl-3">
            <span className="text-xs font-medium text-muted-foreground">
              {notes.length} {notes.length === 1 ? "nota" : "notas"}
            </span>
            <IconButton label="Nova nota (Ctrl+N)" onClick={createNote}>
              <Plus size={18} />
            </IconButton>
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
                  className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                    c === categoriaFiltro ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {c ?? "Todas"}
                </button>
              ))}
            </div>
          )}
          <ul className="flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
            {/* layout="position" slides notes to their new place when the order changes (pin, edit) */}
            <AnimatePresence initial={false}>
              {filtered.map((n) => (
                <motion.li
                  key={n.id}
                  layout="position"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.15 }}
                >
                  <button
                    onClick={() => setSelectedId(n.id)}
                    className={`w-full rounded px-2 py-1.5 text-left transition-colors ${
                      n.id === selectedId ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-1 truncate text-sm font-medium">
                      {n.pinned && <Pin size={12} className="shrink-0 text-primary" />}
                      {n.title || "Sem título"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{n.content.split("\n")[0] || "Vazia"}</div>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </aside>
        </Panel>
        <Separator className="w-px bg-sidebar-border transition-colors outline-none hover:bg-primary focus-visible:bg-primary" />
        <Panel id="editor" minSize={300}>
        {/* key = note id: switching notes remounts the editor, which replays the fade-in */}
        {selected ? (
          <motion.main
            key={selected.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="flex h-full flex-col"
          >
            <div className="flex items-center gap-1 border-b border-border p-3">
              <input
                value={selected.title}
                onChange={(e) => editNote({ title: e.target.value })}
                placeholder="Título"
                className="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none"
              />
              {/* datalist = native autocomplete with the existing categories */}
              <input
                value={selected.category ?? ""}
                // Trim only on blur, so spaces typed between words ("Meu trabalho") are kept
                onChange={(e) => editNote({ category: e.target.value || null })}
                onBlur={() => {
                  const trimmed = selected.category?.trim() || null;
                  if (trimmed !== selected.category) editNote({ category: trimmed });
                }}
                placeholder="Categoria"
                list="categorias"
                className="mr-1 w-32 rounded border border-input bg-transparent px-2 py-1 text-sm outline-none focus:border-ring"
              />
              <datalist id="categorias">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <IconButton
                label={selected.pinned ? "Desafixar" : "Fixar no topo"}
                onClick={() => editNote({ pinned: !selected.pinned })}
                className={selected.pinned ? "text-primary hover:text-primary" : undefined}
              >
                <Pin size={18} />
              </IconButton>
              <IconButton label="Exportar .md" onClick={() => exportNote(selected)}>
                <Download size={18} />
              </IconButton>
              <IconButton label="Apagar" variant="danger" onClick={() => setToDelete(selected)}>
                <Trash2 size={18} />
              </IconButton>
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
          </motion.main>
        ) : (
          <motion.main
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid h-full place-items-center text-muted-foreground"
          >
            <Button variant="outline" onClick={createNote} className="border-dashed hover:border-primary hover:text-primary">
              <Plus size={16} /> Nova nota
            </Button>
          </motion.main>
        )}
        </Panel>
      </Group>

      <ConfirmDialog
        title={toDelete && `Apagar "${toDelete.title || "Sem título"}"?`}
        description="Essa ação não pode ser desfeita."
        confirmLabel="Apagar"
        onConfirm={() => toDelete && deleteNote(toDelete)}
        onCancel={() => setToDelete(null)}
      />
      <Toaster richColors />
    </div>
    </Tooltip.Provider>
    </MotionConfig>
  );
}

// Pinned first, then newest. ISO timestamps sort correctly as plain strings
const newestFirst = (ns: Note[]) =>
  [...ns].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
