// A stand-in for <dialog> in jsdom, and an explicit statement of what it does NOT prove.
//
// jsdom 30 ships no dialog implementation at all: showModal, close and the open property are
// simply absent, and Escape does nothing. Without a stand-in, every test that renders a Sheet
// throws "showModal is not a function", so the choice is a stand-in or no unit tests.
//
// WHAT THIS PROVES: that our component drives the platform correctly -- that opening calls
// showModal, that closing calls close, that the close event is what raises onClose, and that a
// backdrop click dismisses while a click on the content does not. That is our wiring, and it
// is worth testing.
//
// WHAT THIS CANNOT PROVE, because it is imitation and not the platform: the top layer, the
// backdrop rendering, inertness of the page behind, the Escape binding, or focus returning to
// the opener. A test asserting those against this object would only be testing this object.
// They are real requirements and they are verified in a browser, not here.
//
// It deliberately does not implement Escape, so that nobody can write a passing test claiming
// Escape works and believe it.
export function installDialogShim() {
  const proto = globalThis.HTMLDialogElement?.prototype
  if (!proto || typeof proto.showModal === "function") return () => {}
  const open = {
    get(this: HTMLDialogElement) {
      return this.hasAttribute("open")
    },
    set(this: HTMLDialogElement, value: boolean) {
      if (value) this.setAttribute("open", "")
      else this.removeAttribute("open")
    },
    configurable: true,
  }
  Object.defineProperty(proto, "open", open)
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "")
  }
  proto.close = function close(this: HTMLDialogElement, returnValue?: string) {
    if (!this.hasAttribute("open")) return
    this.removeAttribute("open")
    if (returnValue !== undefined) this.returnValue = returnValue
    this.dispatchEvent(new Event("close"))
  }
  return () => {
    Reflect.deleteProperty(proto, "open")
    Reflect.deleteProperty(proto, "showModal")
    Reflect.deleteProperty(proto, "close")
  }
}
