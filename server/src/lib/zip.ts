// Minimal ZIP reader for Cloudflare Workers (no Node.js `zlib`/`fs`, so this
// hand-parses the ZIP local file header format and uses the standard Web
// `DecompressionStream('deflate-raw')` API for the (overwhelmingly common)
// deflate-compressed entries. Good enough to pull one CSV/JSON member out of
// a Kaggle dataset zip without pulling in a heavy npm zip library.

export type ZipEntry = { name: string; sizeBytes: number; compressedSizeBytes: number; method: number; offset: number }

const LOCAL_FILE_HEADER_SIG = 0x04034b50

/** Lists entries by walking local file headers from the start of the buffer.
 * (Simpler and more portable than parsing the central directory, at the cost
 * of not working for zips with a data-descriptor-only layout — rare for the
 * plain dataset zips Kaggle serves.) */
export function listZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer)
  const entries: ZipEntry[] = []
  let offset = 0
  while (offset + 30 <= buffer.byteLength) {
    const sig = view.getUint32(offset, true)
    if (sig !== LOCAL_FILE_HEADER_SIG) break
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const uncompressedSize = view.getUint32(offset + 22, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameBytes = new Uint8Array(buffer, offset + 30, nameLength)
    const name = new TextDecoder().decode(nameBytes)
    const dataOffset = offset + 30 + nameLength + extraLength
    entries.push({ name, sizeBytes: uncompressedSize, compressedSizeBytes: compressedSize, method, offset: dataOffset })
    offset = dataOffset + compressedSize
  }
  return entries
}

/** Extracts and decompresses a single entry's bytes as text (UTF-8). */
export async function extractZipEntryText(buffer: ArrayBuffer, entry: ZipEntry): Promise<string> {
  const compressed = new Uint8Array(buffer, entry.offset, entry.compressedSizeBytes)
  if (entry.method === 0) {
    return new TextDecoder().decode(compressed)
  }
  if (entry.method === 8) {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    const decompressed = await new Response(stream).arrayBuffer()
    return new TextDecoder().decode(decompressed)
  }
  throw new Error(`Unsupported ZIP compression method: ${entry.method} (only store=0 and deflate=8 are supported).`)
}

/** Convenience: finds the first entry whose name matches one of the given
 * extensions (case-insensitive) and returns its decompressed text, or
 * undefined if no matching file is present. */
export async function extractFirstMatchingFile(buffer: ArrayBuffer, extensions: string[]): Promise<{ name: string; text: string } | undefined> {
  const entries = listZipEntries(buffer)
  const lowerExts = extensions.map((e) => e.toLowerCase())
  const match = entries.find((e) => !e.name.endsWith('/') && lowerExts.some((ext) => e.name.toLowerCase().endsWith(ext)))
  if (!match) return undefined
  return { name: match.name, text: await extractZipEntryText(buffer, match) }
}
