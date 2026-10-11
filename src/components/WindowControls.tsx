import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Copy, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";

const win = getCurrentWindow();

export function dragWindow(e: React.MouseEvent) {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    if (e.detail === 2) win.toggleMaximize();
    else win.startDragging();
}

export function WindowControls() {
    const [maximized, setMaximized] = useState(false);

    useEffect(() => {
        const sync = () => win.isMaximized().then(setMaximized, () => {});
        sync();

        const off = win.onResized(sync);
        return () => {
            off.then((f) => f());
        };
    }, []);

    const btn = "grid w-11 place-items-center text-muted-foreground transition-colors hover:text-foreground";
    return (
        <div className="flex self-stretch">
            <button aria-label="Minimizar" title="Minimizar" className={cn(btn, "hover:bg-muted")} onClick={() => win.minimize()}>
                <Minus className="size-4"/>
            </button>
            <button
                aria-label={maximized ? "Restaurar" : "Maximizar"}
                title={maximized ? "Restaurar" : "Maximizar"}
                className={cn(btn, "hover:bg-muted")}
                onClick={() => win.toggleMaximize()}
            >
                {maximized ? <Copy className="size-3.5 -scale-x-100" /> : <Square className="size-3.5" />}
            </button>
            <button
                aria-label="Fechar"
                title="Fechar"
                className={cn(btn, "hover:bg-[#e81123] hover:text-white")}
                onClick={() => win.close()}
            >
                <X className="size-4"/>
            </button>
        </div>
    )
}

