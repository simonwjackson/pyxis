// Real PCM silence exercises metadata and advancing currentTime without a provider or sound.
export function silentAudio(): Blob {
  const samples = 8_000 * 30
  const buffer = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
      view.setUint8(offset + index, value.charCodeAt(index))
  }
  text(0, "RIFF")
  view.setUint32(4, buffer.byteLength - 8, true)
  text(8, "WAVE")
  text(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8_000, true)
  view.setUint32(28, 16_000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, "data")
  view.setUint32(40, samples * 2, true)
  return new Blob([buffer], { type: "audio/wav" })
}
