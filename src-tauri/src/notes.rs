use serde::{Deserialize, Serialize};
use std::{fs, io, path::Path};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

type Res<T> = Result<T, String>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    // ponytail: category is a free-text name on each note; renaming one means editing every note, add a categories.json if that gets annoying
    pub category: Option<String>,
    // `default` lets notes saved before this field existed still load (as false)
    #[serde(default)]
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

// ponytail: whole file rewritten on every save; fine for thousands of notes, move to SQLite if it gets slow
fn notes_file(app: &AppHandle) -> Res<std::path::PathBuf> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("notes.json"))
}

fn load(path: &Path) -> Res<Vec<Note>> {
    match fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(e.to_string()),
    }
}

/// Write to a temp file then rename, so a crash mid-write never corrupts notes.json
fn store(path: &Path, notes: &[Note]) -> Res<()> {
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(notes).map_err(|e| e.to_string())?;
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn upsert(path: &Path, note: Note) -> Res<()> {
    let mut notes = load(path)?;
    match notes.iter_mut().find(|n| n.id == note.id) {
        Some(n) => *n = note,
        None => notes.push(note),
    }
    store(path, &notes)
}

fn remove(path: &Path, id: &str) -> Res<()> {
    let mut notes = load(path)?;
    notes.retain(|n| n.id != id);
    store(path, &notes)
}

// Sync commands run on the main thread, one at a time, so no lock is needed around the file
#[tauri::command]
pub fn list_notes(app: AppHandle) -> Res<Vec<Note>> {
    load(&notes_file(&app)?)
}

#[tauri::command]
pub fn save_note(app: AppHandle, note: Note) -> Res<()> {
    upsert(&notes_file(&app)?, note)
}

#[tauri::command]
pub fn delete_note(app: AppHandle, id: String) -> Res<()> {
    remove(&notes_file(&app)?, &id)
}

/// Opens a "save as" dialog and writes the note as Markdown. Returns false if the user cancels.
/// Async because the dialog blocks while open, and blocking the main thread would freeze the app.
#[tauri::command]
pub async fn export_note(app: AppHandle, title: String, content: String) -> Res<bool> {
    let Some(path) = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .set_file_name(format!("{}.md", file_name(&title)))
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    fs::write(path, format!("# {title}\n\n{content}\n")).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Strips characters Windows forbids in file names
fn file_name(title: &str) -> String {
    let name: String = title.chars().filter(|c| !r#"<>:"/\|?*"#.contains(*c)).collect();
    match name.trim() {
        "" => "nota".into(),
        n => n.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upsert_and_remove_roundtrip() {
        let path = std::env::temp_dir().join(format!("will-notes-test-{}.json", std::process::id()));
        let _ = fs::remove_file(&path);
        let note = |id: &str, title: &str| Note {
            id: id.into(),
            title: title.into(),
            content: String::new(),
            category: None,
            pinned: false,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
        };

        assert!(load(&path).unwrap().is_empty());
        upsert(&path, note("a", "first")).unwrap();
        upsert(&path, note("b", "second")).unwrap();
        upsert(&path, note("a", "edited")).unwrap();
        assert_eq!(load(&path).unwrap(), vec![note("a", "edited"), note("b", "second")]);
        remove(&path, "a").unwrap();
        assert_eq!(load(&path).unwrap(), vec![note("b", "second")]);

        // Notes saved by older versions (no `pinned`, old `category_id`) still load
        fs::write(&path, r#"[{"id":"c","title":"","content":"","category_id":null,"created_at":"","updated_at":""}]"#).unwrap();
        assert!(!load(&path).unwrap()[0].pinned);

        fs::remove_file(&path).unwrap();
    }

    #[test]
    fn file_name_strips_forbidden_chars() {
        assert_eq!(file_name("a/b: c?"), "ab c");
        assert_eq!(file_name("  ???  "), "nota");
    }
}
