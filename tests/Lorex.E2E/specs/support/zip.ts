import { inflateRawSync } from 'node:zlib'

/**
 * Reading a downloaded archive: its table of contents, and the text of one entry.
 *
 * A backup is a ZIP now, and specs need to know what is inside one. The end-of-central-directory record says how many
 * entries there are and where their headers begin, and each header carries its own name, method and offset. That is as far
 * as a browser test should go - what the entries *mean* is settled by the API tests, which can build worlds these screens
 * cannot reach - apart from proving something is *not* in the document, which needs its text.
 *
 * Not a spec file, so Playwright never collects it as one.
 */
interface CentralEntry {
  name: string
  method: number
  compressedSize: number
  localHeader: number
}

function centralDirectory(archive: Buffer): CentralEntry[] {
  // 22 bytes, plus a trailing comment of up to 64 KB, so the record is found by scanning back.
  let end = archive.length - 22
  while (end >= 0 && archive.readUInt32LE(end) !== 0x06054b50) end--
  if (end < 0) throw new Error('Not a ZIP: no end-of-central-directory record.')

  const count = archive.readUInt16LE(end + 10)
  let at = archive.readUInt32LE(end + 16)
  const entries: CentralEntry[] = []

  for (let index = 0; index < count; index++) {
    if (archive.readUInt32LE(at) !== 0x02014b50) throw new Error('Corrupt central directory.')

    const nameLength = archive.readUInt16LE(at + 28)
    const extraLength = archive.readUInt16LE(at + 30)
    const commentLength = archive.readUInt16LE(at + 32)

    entries.push({
      name: archive.subarray(at + 46, at + 46 + nameLength).toString('utf8'),
      method: archive.readUInt16LE(at + 10),
      compressedSize: archive.readUInt32LE(at + 20),
      localHeader: archive.readUInt32LE(at + 42),
    })
    at += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

export function entryNames(archive: Buffer): string[] {
  return centralDirectory(archive).map((entry) => entry.name)
}

/** One entry's bytes as UTF-8 text: stored as is, or deflated - the two methods a Lorex backup writes. */
export function entryText(archive: Buffer, name: string): string {
  const entry = centralDirectory(archive).find((candidate) => candidate.name === name)
  if (!entry) throw new Error(`No ${name} in the archive.`)

  const at = entry.localHeader
  if (archive.readUInt32LE(at) !== 0x04034b50) throw new Error('Corrupt local header.')
  const start = at + 30 + archive.readUInt16LE(at + 26) + archive.readUInt16LE(at + 28)
  const data = archive.subarray(start, start + entry.compressedSize)

  if (entry.method === 0) return data.toString('utf8')
  if (entry.method === 8) return inflateRawSync(data).toString('utf8')
  throw new Error(`Unsupported compression method ${entry.method}.`)
}

/** The four bytes every ZIP starts with, so a download can be checked for being one at all. */
export const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04])
