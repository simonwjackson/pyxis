export function CommandPaletteFooter() {
  return (
    <div className="zune-label flex items-center justify-between px-4 py-2 border-t border-pyxis-border text-pyxis-dim">
      <div className="flex gap-3">
        <span>
          <kbd className="px-1 bg-pyxis-highlight border border-pyxis-border">
            &uarr;&darr;
          </kbd>{" "}
          navigate
        </span>
        <span>
          <kbd className="px-1 bg-pyxis-highlight border border-pyxis-border">
            &crarr;
          </kbd>{" "}
          select
        </span>
        <span>
          <kbd className="px-1 bg-pyxis-highlight border border-pyxis-border">
            esc
          </kbd>{" "}
          close
        </span>
      </div>
    </div>
  );
}
