use serde::{Deserialize, Serialize};
use std::{fs, io, path::Path};
use tauri::{AppHandle, Manager};

type Res<T> = Result<T, String>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub category_id: Option<String>,
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
            category_id: None,
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

        fs::remove_file(&path).unwrap();
    }
}
