/**
 * NAMMA OORU - Lightweight Client-Side EXIF GPS Parser
 *
 * Safely extracts embedded GPS coordinates and capture timestamps from
 * JPEG images without external dependencies. Returns null if EXIF or GPS
 * is not present or if the image is not a JPEG.
 */

/**
 * Extracts GPS metadata from an image File or ArrayBuffer.
 *
 * @param {File | ArrayBuffer} fileOrBuffer
 * @returns {Promise<{ latitude: number, longitude: number, timestamp?: string } | null>}
 */
export async function extractExifGps(fileOrBuffer) {
  try {
    let buffer;
    if (fileOrBuffer instanceof ArrayBuffer) {
      buffer = fileOrBuffer;
    } else if (fileOrBuffer && typeof fileOrBuffer.arrayBuffer === 'function') {
      // Read first 512KB which contains APP1 EXIF segment even on large camera captures
      const slice = fileOrBuffer.slice(0, 524288);
      buffer = await slice.arrayBuffer();
    } else {
      return null;
    }

    const view = new DataView(buffer);
    if (view.byteLength < 4) return null;

    // Check JPEG SOI marker (0xFFD8)
    if (view.getUint16(0, false) !== 0xffd8) {
      return null;
    }

    let offset = 2;
    const maxOffset = Math.min(view.byteLength - 4, 524000);

    // Scan for APP1 marker (0xFFE1)
    while (offset < maxOffset) {
      const marker = view.getUint16(offset, false);
      offset += 2;

      // APP1 marker
      if (marker === 0xffe1) {
        const length = view.getUint16(offset, false);
        return parseExifApp1(view, offset + 2, length - 2);
      }

      // Variable length markers
      if ((marker >= 0xffe0 && marker <= 0xffef) || marker === 0xfffe) {
        const length = view.getUint16(offset, false);
        offset += length;
      } else if (marker === 0xffda || marker === 0xffd9) {
        // Start of scan (SOS) or End of image (EOI) - stop search
        break;
      } else {
        offset++;
      }
    }

    return null;
  } catch (err) {
    console.warn('[NAMMA OORU EXIF] Non-fatal parsing error:', err);
    return null;
  }
}

/**
 * Parses APP1 EXIF segment
 */
function parseExifApp1(view, start, length) {
  if (length < 14) return null;

  // Check "Exif\0\0" header (0x45 0x78 0x69 0x66 0x00 0x00)
  const exifHeader =
    view.getUint32(start, false) === 0x45786966 &&
    view.getUint16(start + 4, false) === 0x0000;

  if (!exifHeader) return null;

  const tiffStart = start + 6;
  const tiffLen = length - 6;
  if (tiffLen < 8) return null;

  // Check endianness: "II" (0x4949) = little-endian, "MM" (0x4D4D) = big-endian
  const byteOrder = view.getUint16(tiffStart, false);
  let littleEndian = false;
  if (byteOrder === 0x4949) {
    littleEndian = true;
  } else if (byteOrder === 0x4d4d) {
    littleEndian = false;
  } else {
    return null;
  }

  // Check 42 mark (0x002A)
  if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002a) {
    return null;
  }

  const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
  if (firstIfdOffset >= tiffLen) return null;

  // 0th IFD
  let ifdOffset = tiffStart + firstIfdOffset;
  if (ifdOffset + 2 > view.byteLength) return null;

  const numEntries = view.getUint16(ifdOffset, littleEndian);
  ifdOffset += 2;

  let gpsIfdOffset = null;
  let dateTimeStr = null;

  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifdOffset + i * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(entryOffset, littleEndian);

    // Tag 0x8825 = GPSInfo IFD Offset
    if (tag === 0x8825) {
      gpsIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
    }
    // Tag 0x0132 = DateTime
    else if (tag === 0x0132) {
      const valOffset = view.getUint32(entryOffset + 8, littleEndian);
      dateTimeStr = readAsciiString(view, tiffStart + valOffset, 20);
    }
  }

  if (gpsIfdOffset === null || gpsIfdOffset >= tiffLen) {
    return null;
  }

  // Parse GPS IFD
  const gpsOffset = tiffStart + gpsIfdOffset;
  if (gpsOffset + 2 > view.byteLength) return null;

  const gpsEntries = view.getUint16(gpsOffset, littleEndian);
  let latRef = 'N';
  let lonRef = 'E';
  let latDegrees = null;
  let lonDegrees = null;

  for (let i = 0; i < gpsEntries; i++) {
    const entry = gpsOffset + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;

    const tag = view.getUint16(entry, littleEndian);
    const valOffset = view.getUint32(entry + 8, littleEndian);

    // 0x0001: GPSLatitudeRef ('N' or 'S')
    if (tag === 0x0001) {
      latRef = String.fromCharCode(view.getUint8(entry + 8));
    }
    // 0x0002: GPSLatitude (3 RATIONALs)
    else if (tag === 0x0002) {
      latDegrees = readGpsCoordinate(view, tiffStart + valOffset, littleEndian);
    }
    // 0x0003: GPSLongitudeRef ('E' or 'W')
    else if (tag === 0x0003) {
      lonRef = String.fromCharCode(view.getUint8(entry + 8));
    }
    // 0x0004: GPSLongitude (3 RATIONALs)
    else if (tag === 0x0004) {
      lonDegrees = readGpsCoordinate(view, tiffStart + valOffset, littleEndian);
    }
  }

  if (latDegrees === null || lonDegrees === null) {
    return null;
  }

  let latitude = latDegrees;
  if (latRef.toUpperCase() === 'S') latitude = -latitude;

  let longitude = lonDegrees;
  if (lonRef.toUpperCase() === 'W') longitude = -longitude;

  // Validate sane coordinate bounds
  if (
    Number.isNaN(latitude) ||
    Number.isNaN(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    timestamp: dateTimeStr || null,
  };
}

/**
 * Reads 3 RATIONAL values (degrees, minutes, seconds) and returns decimal degrees
 */
function readGpsCoordinate(view, offset, littleEndian) {
  if (offset + 24 > view.byteLength) return null;

  const degNum = view.getUint32(offset, littleEndian);
  const degDen = view.getUint32(offset + 4, littleEndian) || 1;
  const degrees = degNum / degDen;

  const minNum = view.getUint32(offset + 8, littleEndian);
  const minDen = view.getUint32(offset + 12, littleEndian) || 1;
  const minutes = minNum / minDen;

  const secNum = view.getUint32(offset + 16, littleEndian);
  const secDen = view.getUint32(offset + 20, littleEndian) || 1;
  const seconds = secNum / secDen;

  return degrees + minutes / 60 + seconds / 3600;
}

/**
 * Reads null-terminated ASCII string from DataView
 */
function readAsciiString(view, offset, maxLen = 32) {
  if (offset + maxLen > view.byteLength) return null;
  const chars = [];
  for (let i = 0; i < maxLen; i++) {
    const code = view.getUint8(offset + i);
    if (code === 0) break;
    chars.push(String.fromCharCode(code));
  }
  return chars.join('').trim();
}
