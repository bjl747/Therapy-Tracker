// Minimal ZIP writer: STORE only (no compression), CRC32, UTF-8 names
// (general-purpose flag bit 11), DOS timestamps. Fine for PNG/JPG/GIF/PDF
// bundles, which are already compressed.

export interface ZipFile {
  name: string
  data: Uint8Array | Blob
  /** defaults to now */
  date?: Date
}

let table: Uint32Array | null = null

export function crc32(data: Uint8Array, seed = 0): number {
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let c = ~seed >>> 0
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 255] ^ (c >>> 8)
  return ~c >>> 0
}

/** MS-DOS date/time (local time, 2-second resolution, year ≥ 1980) */
export function dosDateTime(d: Date): { time: number; date: number } {
  const y = Math.max(1980, d.getFullYear())
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

async function toBytes(d: Uint8Array | Blob): Promise<Uint8Array> {
  return d instanceof Uint8Array ? d : new Uint8Array(await d.arrayBuffer())
}

export async function makeZip(files: ZipFile[]): Promise<Blob> {
  const enc = new TextEncoder()
  const parts: BlobPart[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const seen = new Set<string>()

  for (const f of files) {
    // de-duplicate names so archives never silently collide
    let name = f.name.replace(/\\/g, '/').replace(/^\/+/, '')
    if (seen.has(name)) {
      const dot = name.lastIndexOf('.')
      const base = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let i = 2
      while (seen.has(`${base} (${i})${ext}`)) i++
      name = `${base} (${i})${ext}`
    }
    seen.add(name)

    const data = await toBytes(f.data)
    const nameBytes = enc.encode(name)
    const crc = crc32(data)
    const { time, date } = dosDateTime(f.date ?? new Date())

    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true)
    lh.setUint16(4, 20, true) // version needed
    lh.setUint16(6, 0x0800, true) // UTF-8 names
    lh.setUint16(8, 0, true) // STORE
    lh.setUint16(10, time, true)
    lh.setUint16(12, date, true)
    lh.setUint32(14, crc, true)
    lh.setUint32(18, data.length, true)
    lh.setUint32(22, data.length, true)
    lh.setUint16(26, nameBytes.length, true)
    lh.setUint16(28, 0, true)
    parts.push(new Uint8Array(lh.buffer), nameBytes, data as BlobPart)

    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true)
    ch.setUint16(4, 20, true) // made by
    ch.setUint16(6, 20, true) // needed
    ch.setUint16(8, 0x0800, true)
    ch.setUint16(10, 0, true)
    ch.setUint16(12, time, true)
    ch.setUint16(14, date, true)
    ch.setUint32(16, crc, true)
    ch.setUint32(20, data.length, true)
    ch.setUint32(24, data.length, true)
    ch.setUint16(28, nameBytes.length, true)
    ch.setUint32(42, offset, true)
    const rec = new Uint8Array(46 + nameBytes.length)
    rec.set(new Uint8Array(ch.buffer))
    rec.set(nameBytes, 46)
    central.push(rec)

    offset += 30 + nameBytes.length + data.length
  }

  let cdSize = 0
  for (const c of central) {
    parts.push(c as BlobPart)
    cdSize += c.length
  }
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, cdSize, true)
  end.setUint32(16, offset, true)
  parts.push(new Uint8Array(end.buffer))
  return new Blob(parts, { type: 'application/zip' })
}
