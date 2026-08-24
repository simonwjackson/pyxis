// Theme toggle for the prototypes. Follows the system by default; an explicit choice
// is remembered so the same page can be compared light against dark on one device.

const KEY = "pyxis-theme"

export function currentTheme() {
  const explicit = document.documentElement.dataset.theme
  if (explicit === "light" || explicit === "dark") return explicit
  const stored = localStorage.getItem(KEY)
  if (stored === "light" || stored === "dark") return stored
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function mountThemeToggle() {
  const nav = document.querySelector("nav.proto")
  if (!nav) return
  const button = document.createElement("button")
  button.className = "theme"
  button.type = "button"

  const paint = () => {
    const theme = currentTheme()
    button.textContent = theme === "dark" ? "light" : "dark"
    button.setAttribute("aria-label", `Switch to ${button.textContent} mode`)
  }

  button.onclick = () => {
    const next = currentTheme() === "dark" ? "light" : "dark"
    localStorage.setItem(KEY, next)
    document.documentElement.dataset.theme = next
    paint()
  }

  paint()
  nav.append(button)
}
