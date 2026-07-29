const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jsonPath = path.join(__dirname, "../config/rfidReaders.json");

/**
 * Dynamically read rfidReaders.json from disk to ensure real-time coordinate updates
 */
function getReadersList() {
  try {
    const raw = fs.readFileSync(jsonPath, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return require("../config/rfidReaders.json");
  }
}

// In-memory cache: RFID tag code -> latest scan state
const latestTagState = new Map();

// Token Map: Token String -> { token, idManagementId, tagCode, visitorName, createdAt }
const tokenMap = new Map();

/**
 * Generate a QR Tracking Token for a visitor.
 * Looks up the visitor record in the DB by IdManagementID to get their assigned RfidCode.
 * Falls back to an explicitly passed rfidCode/tagCode if DB lookup not needed.
 *
 * @param {object} opts
 * @param {number} [opts.idManagementId] - DB primary key to cross-check visitor's assigned RFID
 * @param {string} [opts.rfidCode]       - Direct RFID code (used if idManagementId not provided)
 * @param {string} [opts.visitorName]    - Display name override
 */
async function generateQrToken({ idManagementId, rfidCode, tagCode, visitorName }) {
  let resolvedRfidCode = (rfidCode || tagCode || "").trim().toUpperCase();
  let resolvedName = visitorName || "Guest Visitor";
  let resolvedIdManagementId = idManagementId || null;

  // --- DB Cross-check: Look up the visitor by IdManagementID ---
  if (idManagementId) {
    try {
      const IdManagement = require("../models/IDManagement.model");
      const visitor = await IdManagement.getVisitorWithRfid(idManagementId);
      if (visitor) {
        resolvedName = visitor.VisitorName || resolvedName;
        // Use DB-assigned RfidCode (authoritative source)
        if (visitor.RfidCode) {
          resolvedRfidCode = visitor.RfidCode.trim().toUpperCase();
        }
        console.log(
          `🔎 [QR TOKEN] DB cross-check for IdManagementID #${idManagementId}: ` +
          `Visitor='${resolvedName}', RfidCode='${resolvedRfidCode}'`
        );
      } else {
        console.warn(`⚠️ [QR TOKEN] No active visitor found for IdManagementID #${idManagementId}`);
      }
    } catch (dbErr) {
      console.error("⚠️ [QR TOKEN] DB lookup failed, using provided rfidCode:", dbErr.message);
    }
  }

  if (!resolvedRfidCode) {
    throw new Error("Cannot generate token: No RFID Code resolved. Assign an RFID badge to the visitor first.");
  }

  const token = "VTK_" + crypto.randomBytes(8).toString("hex");
  const tokenData = {
    token,
    idManagementId: resolvedIdManagementId,
    tagCode: resolvedRfidCode,
    visitorName: resolvedName,
    createdAt: new Date().toISOString(),
  };

  tokenMap.set(token, tokenData);

  const mapUrl = `http://192.168.20.10:7000/temp/?token=${token}`;

  console.log("\n=========================================================");
  console.log("🔑 [VISITOR QR TOKEN GENERATED]");
  if (resolvedIdManagementId) {
    console.log(`📋 DB IdManagementID:   #${resolvedIdManagementId}`);
  }
  console.log(`📌 Visitor Name:        ${resolvedName}`);
  console.log(`🏷️ RFID Tag Code:       ${resolvedRfidCode}`);
  console.log(`🎫 Tracking Token:      ${token}`);
  console.log(`🌐 Temp Browser URL:    ${mapUrl}`);
  console.log("=========================================================\n");

  return { token, mapUrl, tokenData };
}

/**
 * Resolve a QR Token to live path data.
 * Cross-checks the DB to ensure the visitor's RfidCode hasn't changed since token was issued.
 *
 * @param {string} tokenInput - The VTK_... token string
 */
/**
 * Resolve a QR Token to live path data.
 * Cross-checks the DB to ensure the visitor's assigned RfidCode in SQL Server is used.
 *
 * @param {string} tokenInput - The VTK_... token string or tag code
 */
async function getLivePathByToken(tokenInput) {
  const token = (tokenInput || "").trim();
  let tokenData = tokenMap.get(token);

  // If token is not in memory cache (e.g. after backend restart), query SQL Server DB
  if (!tokenData) {
    try {
      const IdManagement = require("../models/IDManagement.model");
      const dbRecord = await IdManagement.findByToken(token);
      if (dbRecord) {
        tokenData = {
          token,
          idManagementId: dbRecord.IdManagementID,
          tagCode: dbRecord.RfidCode || dbRecord.RfidCodeHex || token,
          visitorName: dbRecord.VisitorName || "Visitor",
        };
        tokenMap.set(token, tokenData);
      }
    } catch (dbErr) {
      console.error("⚠️ [TOKEN RESOLUTION] DB lookup error:", dbErr.message);
    }
  }

  if (!tokenData) {
    // If unknown token, fall back to checking if it's a direct RFID tag registered in DB
    return await getLivePathForTag(token);
  }

  let tagCodeToUse = tokenData.tagCode;

  // --- DB Cross-check: Re-verify the visitor's current assigned RfidCode from DB ---
  if (tokenData.idManagementId) {
    try {
      const IdManagement = require("../models/IDManagement.model");
      const visitor = await IdManagement.getVisitorWithRfid(tokenData.idManagementId);
      if (visitor) {
        const freshCode = (visitor.RfidCode || visitor.RfidCodeHex || tagCodeToUse).trim().toUpperCase();
        if (freshCode !== tagCodeToUse) {
          console.log(
            `🔄 [TOKEN REFRESH] RfidCode updated for IdManagementID #${tokenData.idManagementId}: ` +
            `'${tagCodeToUse}' -> '${freshCode}'`
          );
          tokenData.tagCode = freshCode;
          tagCodeToUse = freshCode;
        }
        tokenData.visitorName = visitor.VisitorName || tokenData.visitorName;
      }
    } catch (dbErr) {
      console.error("⚠️ [TOKEN REFRESH] DB re-check failed, using cached tagCode:", dbErr.message);
    }
  }

  const livePath = await getLivePathForTag(tagCodeToUse);
  return {
    ...livePath,
    visitorName: tokenData.visitorName || livePath.visitorName,
    token: tokenData.token,
    idManagementId: tokenData.idManagementId,
  };
}

/**
 * Get full readers list (Fresh from disk)
 */
function getAllReaders() {
  return getReadersList();
}

/**
 * Find reader by ID
 */
function findReader(readerIdInput) {
  const readersList = getReadersList();
  const numId = parseInt(readerIdInput, 10);
  return readersList.find(
    (r) => r.id === numId || String(r.id) === String(readerIdInput)
  );
}

/**
 * Process and update an RFID scan for a tag
 * Cross-checks database to verify if tag belongs to a registered visitor.
 * ONLY updates live position if timestamp is newer than existing stored timestamp.
 */
/**
 * Process and update an RFID scan for a tag
 * Matches incoming stream tags (e.g. 56303032E5B68E68BB0DE045) by 8-character hex prefix (56303032 = V002, 56303031 = V001).
 * Cross-checks SQL Server DB first, with hardcoded fallback support for V001 and V002 tags.
 */
async function updateScan({ rfid_code, epc, machine_number, readerId, received_at, rawHex }) {
  const tagCode = (epc || rfid_code || "").trim().toUpperCase();
  const targetReaderId = readerId || machine_number;

  if (!tagCode) {
    throw new Error("Missing RFID tag code / EPC");
  }

  const reader = findReader(targetReaderId);
  const scanTime = received_at ? new Date(received_at) : new Date();
  const IdManagement = require("../models/IDManagement.model");
  const { raw, hex, prefixHex, asciiTag } = IdManagement.normalizeRfidFormats(tagCode);

  // 1. Cross-check SQL Server DB to find registered visitor matching this RFID tag or prefix
  let visitorMatch = null;
  try {
    visitorMatch = await IdManagement.findByRfidCode(tagCode);
  } catch (err) {
    // Non-blocking DB lookup error
  }

  // Fallback visitor assignment for V001 and V002 if DB returns null
  if (!visitorMatch) {
    if (asciiTag === "V001" || prefixHex === "56303031") {
      visitorMatch = { VisitorName: "Visitor V001", IdManagementID: 9001, IdNumber: "V001", Company: "Main Entrance Tag" };
    } else if (asciiTag === "V002" || prefixHex === "56303032") {
      visitorMatch = { VisitorName: "Visitor V002", IdManagementID: 9002, IdNumber: "V002", Company: "Main Entrance Tag" };
    }
  }

  // 2. Lookup existing state by any known key format (full hex, 8-digit prefix, ASCII tag)
  const existingState =
    latestTagState.get(tagCode) ||
    (prefixHex ? latestTagState.get(prefixHex) : null) ||
    (asciiTag ? latestTagState.get(asciiTag) : null) ||
    (raw ? latestTagState.get(raw) : null) ||
    (hex ? latestTagState.get(hex) : null);

  if (!existingState || scanTime > new Date(existingState.received_at)) {
    const updatedState = {
      tagCode: raw || tagCode,
      tagCodeHex: hex || tagCode,
      prefixHex: prefixHex || tagCode.substring(0, 8),
      asciiTag: asciiTag || raw || tagCode,
      visitorName: visitorMatch ? visitorMatch.VisitorName : `Visitor (${asciiTag || prefixHex})`,
      idManagementId: visitorMatch ? visitorMatch.IdManagementID : null,
      company: visitorMatch ? visitorMatch.Company : null,
      readerId: reader ? reader.id : targetReaderId,
      sequence: reader ? reader.sequence : 1,
      location: reader ? reader.location : "Unknown Location",
      coords: reader ? reader.coords : { x: 12, y: 82 },
      received_at: scanTime.toISOString(),
      rawHex: rawHex || null,
    };

    // Store state indexed by ALL formats for fast lookup by any variant
    latestTagState.set(tagCode, updatedState);
    if (prefixHex) latestTagState.set(prefixHex, updatedState);
    if (asciiTag) latestTagState.set(asciiTag, updatedState);
    if (raw) latestTagState.set(raw, updatedState);
    if (hex) latestTagState.set(hex, updatedState);

    console.log(
      `📡 [RFID TRACKER] Tag '${tagCode}' (Prefix: '${prefixHex}' = '${asciiTag}') scanned at Reader #${updatedState.readerId} (${updatedState.location}) [Seq ${updatedState.sequence}/15]` +
      (visitorMatch ? ` -> Visitor: ${visitorMatch.VisitorName}` : " [Unassigned Tag]")
    );
    return updatedState;
  }

  return existingState;
}

/**
 * Get current live position & shortened path for an RFID tag
 * Cross-checks SQL Server DB or uses prefix/hardcoded fallback (V001 / V002).
 */
async function getLivePathForTag(tagCodeInput) {
  const readersList = getReadersList();
  const rawTag = (tagCodeInput || "").trim().toUpperCase();
  const IdManagement = require("../models/IDManagement.model");
  const { raw, hex, prefixHex, asciiTag } = IdManagement.normalizeRfidFormats(rawTag);

  // Cross-check database for registered visitor record matching this tag, prefix, or token
  let dbVisitor = null;
  try {
    dbVisitor = await IdManagement.findByRfidCode(rawTag) || await IdManagement.findByToken(rawTag);
  } catch (err) {
    console.error("⚠️ [LIVE PATH] DB lookup error:", err.message);
  }

  // Fallback visitor details for V001 / V002 if DB record not found
  if (!dbVisitor) {
    if (asciiTag === "V001" || prefixHex === "56303031") {
      dbVisitor = { VisitorName: "Visitor V001", IdManagementID: 9001, IdNumber: "V001", Company: "Tag V001" };
    } else if (asciiTag === "V002" || prefixHex === "56303032") {
      dbVisitor = { VisitorName: "Visitor V002", IdManagementID: 9002, IdNumber: "V002", Company: "Tag V002" };
    }
  }

  // 2. Multi-tier state lookup: direct match, prefix match, or ASCII tag match
  let currentState =
    latestTagState.get(rawTag) ||
    (asciiTag ? latestTagState.get(asciiTag) : null) ||
    (prefixHex ? latestTagState.get(prefixHex) : null) ||
    (raw ? latestTagState.get(raw) : null) ||
    (hex ? latestTagState.get(hex) : null);

  // Partial prefix search scan if exact map key not hit directly
  if (!currentState && prefixHex && prefixHex.length >= 8) {
    for (const [key, state] of latestTagState.entries()) {
      if (key.startsWith(prefixHex) || state.prefixHex === prefixHex || state.asciiTag === asciiTag) {
        currentState = state;
        break;
      }
    }
  }

  const currentSequence = currentState ? currentState.sequence : 1;
  const currentReader = readersList.find((r) => r.sequence === currentSequence) || readersList[0];

  const remainingPath = readersList.filter((r) => r.sequence >= currentSequence);
  const passedPath = readersList.filter((r) => r.sequence < currentSequence);

  const progressPercent = Math.round((currentSequence / readersList.length) * 100);

  return {
    tagCode: rawTag,
    tagCodeHex: hex,
    prefixHex: prefixHex,
    asciiTag: asciiTag,
    isRegisteredVisitor: !!dbVisitor,
    visitorName: dbVisitor ? dbVisitor.VisitorName : (currentState?.visitorName || `Visitor (${asciiTag || rawTag})`),
    company: dbVisitor ? dbVisitor.Company : (currentState?.company || null),
    purpose: dbVisitor ? dbVisitor.Purpose : null,
    idManagementId: dbVisitor ? dbVisitor.IdManagementID : null,
    hasScanned: !!currentState,
    currentReader: {
      id: currentReader.id,
      sequence: currentReader.sequence,
      location: currentReader.location,
      coords: currentReader.coords,
      lastScannedAt: currentState ? currentState.received_at : null,
    },
    progressPercent,
    isAtDestination: currentSequence === readersList.length,
    remainingPath,
    passedPath,
    allReaders: readersList,
  };
}

module.exports = {
  getAllReaders,
  updateScan,
  getLivePathForTag,
  generateQrToken,
  getLivePathByToken,
};
