// Drawn controls, with weight.
//
// Transport is the most iconic control in the category. Unicode glyphs in bordered boxes have
// no weight, render differently on every platform, and look like a form from 1998. These are
// filled shapes on a 24-unit grid, sized by the stylesheet, coloured by currentColor.

const svg = (body, label) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"${
    label ? ` role="img" aria-label="${label}"` : ""
  }>${body}</svg>`

export const icon = {
  play: svg(`<path d="M7 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z"/>`),
  pause: svg(
    `<rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/>`,
  ),
  prev: svg(
    `<rect x="4" y="5" width="2.5" height="14" rx="0.75"/><path d="M19 5.9v12.2a1 1 0 0 1-1.55.83L8.6 13a1.2 1.2 0 0 1 0-2l8.85-5.93A1 1 0 0 1 19 5.9z"/>`,
  ),
  next: svg(
    `<rect x="17.5" y="5" width="2.5" height="14" rx="0.75"/><path d="M5 5.9v12.2a1 1 0 0 0 1.55.83L15.4 13a1.2 1.2 0 0 0 0-2L6.55 5.07A1 1 0 0 0 5 5.9z"/>`,
  ),
  // A chevron for "put this away", because the player is a layer and a layer goes down.
  down: svg(
    `<path d="M4.3 8.3a1 1 0 0 1 1.4 0L12 14.6l6.3-6.3a1 1 0 1 1 1.4 1.4l-7 7a1 1 0 0 1-1.4 0l-7-7a1 1 0 0 1 0-1.4z"/>`,
  ),
  // Sound, for volume: a speaker and one arc. Not three.
  sound: svg(
    `<path d="M4 9.5v5a1 1 0 0 0 1 1h2.6l4.7 3.8a.6.6 0 0 0 1-.47V5.17a.6.6 0 0 0-1-.47L7.6 8.5H5a1 1 0 0 0-1 1z"/><path d="M16.2 8.6a1 1 0 0 1 1.4.1 5 5 0 0 1 0 6.6 1 1 0 0 1-1.5-1.3 3 3 0 0 0 0-4 1 1 0 0 1 .1-1.4z"/>`,
  ),
}
