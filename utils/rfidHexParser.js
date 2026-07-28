/**
 * RRUHFR03 RFID Reader Hex Packet Parser
 * Example input string: "BB13E04106000000000CE28011B0A502006E81D29C8C4698"
 */

function parseRRUHFR03Hex(rawHex) {
  if (!rawHex || typeof rawHex !== "string") {
    throw new Error("Invalid raw hex string input");
  }

  const cleanHex = rawHex.trim().toUpperCase();

  // Validate start of frame header 'BB'
  if (!cleanHex.startsWith("BB")) {
    throw new Error("Invalid frame header. Expected 'BB'");
  }

  let readerId = null;
  let epc = null;
  let rssi = null;

  // 1. Parse Reader ID
  // Find flag byte '41'
  const flagIndex = cleanHex.indexOf("41");
  if (flagIndex !== -1 && cleanHex.length >= flagIndex + 10) {
    // 4 bytes (8 hex characters) after '41'
    const rawReaderIdHex = cleanHex.substr(flagIndex + 2, 8); // e.g. "06000000"

    // Reverse byte pairs to convert from little-endian sequence to integer
    const reversedHex = [
      rawReaderIdHex.substr(6, 2),
      rawReaderIdHex.substr(4, 2),
      rawReaderIdHex.substr(2, 2),
      rawReaderIdHex.substr(0, 2),
    ].join(""); // e.g. "00000006"

    readerId = parseInt(reversedHex, 16);
  }

  // 2. Parse EPC
  // Locate '0C' marker (12 bytes)
  const epcMarkerIndex = cleanHex.indexOf("0C");
  if (epcMarkerIndex !== -1) {
    const lenHex = cleanHex.substr(epcMarkerIndex, 2); // "0C"
    const byteLen = parseInt(lenHex, 16); // 12 bytes
    const totalChars = cleanHex.length - (epcMarkerIndex + 2);

    // If remaining payload after 0C is less than 24 chars, take remaining minus 4 CRC chars
    if (totalChars < 24) {
      epc = cleanHex.substr(epcMarkerIndex + 2, Math.max(0, totalChars - 4));
    } else {
      epc = cleanHex.substr(epcMarkerIndex + 2, 23);
    }
  } else if (cleanHex.length >= 35) {
    epc = cleanHex.substr(20, 23);
  }

  return {
    rawHex: cleanHex,
    readerId: readerId ? String(readerId) : null,
    epc: epc || cleanHex,
    rssi,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  parseRRUHFR03Hex,
};
