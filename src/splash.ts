import { getVersion } from "@tauri-apps/api/app";

getVersion().then((v) => (document.getElementById("version")!.textContent = `v${v}`));
