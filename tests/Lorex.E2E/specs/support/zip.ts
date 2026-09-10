/**
 * Reading a downloaded archive's table of contents, without unpacking it.
 *
 * A backup is a ZIP now, and two specs need to know what is inside one. Nothing is
 * decompressed: the end-of-central-directory record says how many entries there are and where
 * their headers begin, and each header carries its own name. That is as far as a browser test
 * should go - what the entries *hold* is settled by the API tests, which can build worlds these
 * screens cannot reach.
 *
 * Not a spec file, so Playwright never collects it as one.
 */
export function entryNames(archive: Buffer): string[] {
  // 22 bytes, plus a trailing comment of up to 64 KB, so the record is found by scanning back.
  let end = archive.length - 22
  while (end >= 0 && archive.readUInt32LE(end) !== 0x06054b50) end--
  if (end < 0) throw new Error('Not a ZIP: no end-of-central-directory record.')

  const count = archive.readUInt16LE(end + 10)
  let at = archive.readUInt32LE(end + 16)
  const names: string[] = []

  for (let index = 0; index < count; index++) {
    if (archive.readUInt32LE(at) !== 0x02014b50) throw new Error('Corrupt central directory.')

    const nameLength = archive.readUInt16LE(at + 28)
    const extraLength = archive.readUInt16LE(at + 30)
    const commentLength = archive.readUInt16LE(at + 32)

    names.push(archive.subarray(at + 46, at + 46 + nameLength).toString('utf8'))
    at += 46 + nameLength + extraLength + commentLength
  }

  return names
}

/** The four bytes every ZIP starts with, so a download can be checked for being one at all. */
export const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04])
