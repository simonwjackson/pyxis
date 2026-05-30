import {
  Bookmark,
  LayoutGrid,
  Moon,
  Palette,
  Play,
  Radio,
  Search,
  Settings,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { type RefObject, useCallback, useEffect, useState } from "react";
import { filterCommands, groupCommands } from "@app/shared/lib/commands";
import { CommandPaletteSelectableItem } from "./CommandPaletteSelectableItem";

type CommandPaletteCommandListPanelProps = {
  readonly query: string;
  readonly listRef: RefObject<HTMLDivElement | null>;
  readonly onExecute: (action: string) => void;
  readonly onOpenThemes: () => void;
  readonly onClose: () => void;
};

const iconMap: Record<string, typeof Play> = {
  playPause: Play,
  skipTrack: SkipForward,
  likeTrack: ThumbsUp,
  dislikeTrack: ThumbsDown,
  sleepTrack: Moon,
  bookmarkSong: Bookmark,
  goToStations: Radio,
  goToSearch: Search,
  goToBookmarks: Bookmark,
  goToGenres: LayoutGrid,
  goToSettings: Settings,
  changeTheme: Palette,
};

export function CommandPaletteCommandListPanel({
  query,
  listRef,
  onExecute,
  onOpenThemes,
  onClose,
}: CommandPaletteCommandListPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = filterCommands(query);
  const grouped = groupCommands(filteredCommands);
  const flatItems = grouped.flatMap((group) => group.commands);

  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector("[data-selected='true']");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [listRef]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => Math.min(index + 1, flatItems.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const item = flatItems[selectedIndex];
        if (item) {
          if (item.action === "changeTheme") {
            onOpenThemes();
          } else {
            onExecute(item.action);
          }
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [flatItems, selectedIndex, onExecute, onOpenThemes, onClose],
  );

  return (
    <div onKeyDown={handleKeyDown}>
      {grouped.map((group, groupIdx) => {
        const prevCount = grouped
          .slice(0, groupIdx)
          .reduce((sum, candidate) => sum + candidate.commands.length, 0);
        return (
          <div key={group.category}>
            <div className="px-3 py-1">
              <p className="zune-label text-[var(--color-text-dim)]">
                {group.category}
              </p>
            </div>
            {group.commands.map((command, commandIdx) => {
              const globalIdx = prevCount + commandIdx;
              const isSelected = globalIdx === selectedIndex;
              const Icon = iconMap[command.id] ?? Search;
              return (
                <CommandPaletteSelectableItem
                  key={command.id}
                  selected={isSelected}
                  onClick={() => {
                    if (command.action === "changeTheme") {
                      onOpenThemes();
                    } else {
                      onExecute(command.action);
                    }
                  }}
                  onMouseEnter={() => setSelectedIndex(globalIdx)}
                >
                  <Icon
                    className={`w-4 h-4 ${isSelected ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"}`}
                  />
                  <span
                    className={`flex-1 text-[0.98rem] font-light tracking-[-0.02em] lowercase ${isSelected ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}
                  >
                    {command.label}
                  </span>
                  {command.shortcut ? (
                    <kbd className="zune-label px-1.5 py-0.5 text-[var(--color-text-dim)] bg-[var(--color-bg-highlight)] border border-[var(--color-border)]">
                      {command.shortcut}
                    </kbd>
                  ) : null}
                  {command.action === "changeTheme" ? (
                    <span className="text-[10px] text-[var(--color-text-dim)]">
                      &rarr;
                    </span>
                  ) : null}
                </CommandPaletteSelectableItem>
              );
            })}
          </div>
        );
      })}
      {flatItems.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-[var(--color-text-dim)] lowercase">
          no commands found
        </div>
      ) : null}
    </div>
  );
}
