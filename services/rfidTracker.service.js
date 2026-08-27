const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const rfidConfig = require("../config/rfidConfig");
const jsonPath = path.join(__dirname, "../config/rfidReaders.json");

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dynamically read rfidReaders.json from disk so live edits take effect
 * without a server restart.
 */
function getReadersList() {
  try {
    return JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  } catch (e) {
    return require("../config/rfidReaders.json");
  }
}

/**
 * Find reader by numeric id field.
 * @param {string|number} readerId
 */
function findReaderById(readerId) {
  const list = getReadersList();
  const num = Number(readerId);
  return list.find((r) => r.id === num) || null;
}

/**
 * Convert an ASCII tag label (e.g. "V002") to its 8-char hex prefix key.
 *   "V002" → Buffer.from("V002","utf8") = [0x56,0x30,0x30,0x32] → "56303032"
 * If the input is ALREADY an 8-char hex string it is returned as-is.
 */
/**
 * Convert an idNumber (e.g. "V002" or "09]ú") to an 8-character Hex representation:
 *   - "V002" -> [0x56, 0x30, 0x30, 0x32] -> "56303032"
 *   - "09]ú" -> [0x30, 0x39, 0x5D, 0xFA] -> "30395DFA"
 *   - If input is ALREADY an 8+ char hex string (e.g. "30395DFA82BF..."),
 *     returns the first 8 uppercase hex digits ("30395DFA").
 */
function idNumberToHex8(idNumber) {
  if (!idNumber) return null;
  const str = String(idNumber).trim();
  // Already hex string with at least 8 digits?
  if (/^[0-9A-F]{8,}$/i.test(str)) {
    return str.substring(0, 8).toUpperCase();
  }
  // Try latin1 (single-byte character encoding) for up to 4 chars
  const sub = str.substring(0, 4);
  const latin1Hex = Buffer.from(sub, "latin1").toString("hex").toUpperCase();
  if (latin1Hex.length === 8) {
    return latin1Hex;
  }
  // Fallback to utf8 if latin1 doesn't produce 8 chars
  return Buffer.from(sub, "utf8").toString("hex").toUpperCase().substring(0, 8);
}

function asciiToHexPrefix(label) {
  return idNumberToHex8(label);
}

// ─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY STATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Primary state map:   tagId (8-char hex prefix / raw idNumber) → scan state object
 *
 * e.g.  latestTagState.get("30395DFA")  →  { tagId, machineNumber, location, coords, received_at, … }
 */
const latestTagState = new Map();

/**
 * Token map:  VTK_... token string → { token, idManagementId, tagCode, visitorName, createdAt }
 */
const tokenMap = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process and store an RFID scan in-memory.
 *
 * Compares the FIRST 8 DIGITS of rfid_code from the live API (http://16.170.141.146:5000/data).
 */
async function updateScan({ tagId, machine_number, received_at }) {
  if (!tagId || !machine_number) return null;

  const rawCode = tagId.trim().toUpperCase();
  // Extract first 8 hex digits of rfid_code from live stream (e.g. "30395DFA82BF..." -> "30395DFA")
  const hex8Prefix = rawCode.length >= 8 ? rawCode.substring(0, 8) : idNumberToHex8(rawCode);
  const scanTime = received_at ? new Date(received_at) : new Date();
  const reader = findReaderById(machine_number);

  const state = {
    tagId:         rawCode,
    hex8Prefix:    hex8Prefix,
    machineNumber: Number(machine_number),
    readerId:      reader ? reader.id      : Number(machine_number),
    sequence:      reader ? reader.sequence : 1,
    location:      reader ? reader.location : "Unknown Location",
    coords:        reader ? reader.coords   : { x: 12, y: 82 },
    received_at:   scanTime.toISOString(),
  };

  // Do not overwrite state if we already have a newer scan for this tag
  const existing = latestTagState.get(hex8Prefix);
  if (existing && existing.received_at && new Date(scanTime) < new Date(existing.received_at)) {
    return existing;
  }

  // Store under 8 hex digits key as well as full rawCode key
  latestTagState.set(hex8Prefix, state);
  latestTagState.set(rawCode, state);

  // Decode 8 hex digits using latin1 (e.g. "30395DFA" -> "09]ú") and map state to decoded tag string
  try {
    const latin1Tag = Buffer.from(hex8Prefix, "hex").toString("latin1").trim();
    if (latin1Tag) {
      latestTagState.set(latin1Tag, state);
      latestTagState.set(latin1Tag.toUpperCase(), state);
    }
  } catch (_) {}

  // Decode using utf8 as fallback
  try {
    const utf8Tag = Buffer.from(hex8Prefix, "hex").toString("utf8").trim();
    if (utf8Tag) {
      latestTagState.set(utf8Tag, state);
      latestTagState.set(utf8Tag.toUpperCase(), state);
    }
  } catch (_) {}

  // Persist to SQL (non-blocking)
  try {
    const RfidLogModel = require("../models/RfidLog.model");
    await RfidLogModel.createLog({
      rfid_code:      rawCode,
      machine_number: machine_number,
      location:       state.location,
      received_at:    state.received_at,
    });
  } catch (_) { /* non-blocking */ }

  return state;
}

/**
 * Return the full live-path response for a given idNumber identifier.
 *
 * Converts the idNumber (e.g. "09]ú" or "V002") to its 8-character Hex representation ("30395DFA")
 * and compares it against the first 8 digits of rfid_code from the live API.
 *
 * @param {string} [idNumberInput]
 */
async function getLivePathForTag(idNumberInput) {
  const readersList = getReadersList();
  const rawInput = (idNumberInput || rfidConfig.DEFAULT_TRACKING_TAG).trim();

  // Convert idNumber to 8-character hex value (e.g. "09]ú" -> "30395DFA", "V002" -> "56303032")
  const targetHex8 = idNumberToHex8(rawInput);

  // ── State lookup: compare targetHex8 against the first 8 digits of live API rfid_code ──────
  const currentState =
    (targetHex8 ? latestTagState.get(targetHex8) : null) ||
    latestTagState.get(rawInput) ||
    latestTagState.get(rawInput.toUpperCase()) ||
    null;

  // ── DB visitor lookup (non-blocking, best-effort) ────────────────────────
  let dbVisitor = null;
  try {
    const IdManagement = require("../models/IDManagement.model");
    dbVisitor = await IdManagement.findByRfidCode(rawInput);
  } catch (_) { /* non-blocking */ }

  if (!dbVisitor) {
    dbVisitor = rfidConfig.getDefaultVisitorFallback(rawInput);
  }

  // ── Build response ────────────────────────────────────────────────────────
  const currentSequence = currentState ? currentState.sequence : 1;
  const currentReader   = readersList.find((r) => r.sequence === currentSequence) || readersList[0];
  const remainingPath   = readersList.filter((r) => r.sequence >= currentSequence);
  const passedPath      = readersList.filter((r) => r.sequence < currentSequence);
  const progressPercent = Math.round((currentSequence / readersList.length) * 100);

  return {
    tagCode:           rawInput,
    hex8Prefix:        targetHex8,
    isRegisteredVisitor: !!dbVisitor,
    visitorName:       dbVisitor?.VisitorName || `Visitor (${rawInput})`,
    company:           dbVisitor?.Company     || null,
    purpose:           dbVisitor?.Purpose     || null,
    idManagementId:    dbVisitor?.IdManagementID || null,
    hasScanned:        !!currentState,
    currentReader: {
      id:           currentReader.id,
      sequence:     currentReader.sequence,
      location:     currentReader.location,
      coords:       currentReader.coords,
      lastScannedAt: currentState?.received_at || null,
    },
    progressPercent,
    isAtDestination:  currentSequence === readersList.length,
    remainingPath,
    passedPath,
    allReaders:       readersList,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// QR TOKEN FLOW (unchanged logic, kept for compatibility)
// ─────────────────────────────────────────────────────────────────────────────

async function generateQrToken({ idManagementId, rfidCode, tagCode, visitorName }) {
  let resolvedRfidCode = (rfidCode || tagCode || rfidConfig.DEFAULT_TRACKING_TAG).trim().toUpperCase();
  let resolvedName     = visitorName || "Guest Visitor";
  let resolvedIdMgmtId = idManagementId || null;

  if (idManagementId) {
    try {
      const IdManagement = require("../models/IDManagement.model");
      const visitor = await IdManagement.getVisitorWithRfid(idManagementId);
      if (visitor) {
        resolvedName     = visitor.VisitorName || resolvedName;
        const freshCode  = (visitor.IdNumber || visitor.RfidCode || "").trim().toUpperCase();
        if (freshCode) resolvedRfidCode = freshCode;
        console.log(
          `🔎 [QR TOKEN] DB cross-check for #${idManagementId}: ` +
          `Visitor='${resolvedName}', IdNumber/Tag='${resolvedRfidCode}'`
        );
      }
    } catch (dbErr) {
      console.error("⚠️ [QR TOKEN] DB lookup failed:", dbErr.message);
    }
  }

  const token     = "VTK_" + crypto.randomBytes(8).toString("hex");
  const tokenData = {
    token,
    idManagementId: resolvedIdMgmtId,
    tagCode:        resolvedRfidCode,
    visitorName:    resolvedName,
    createdAt:      new Date().toISOString(),
  };
  tokenMap.set(token, tokenData);

  const mapUrl = `http://localhost:3000/temp/?token=${token}`;
  console.log("\n=========================================================");
  console.log("🔑 [VISITOR QR TOKEN GENERATED]");
  if (resolvedIdMgmtId) console.log(`📋 DB IdManagementID:  #${resolvedIdMgmtId}`);
  console.log(`📌 Visitor Name:       ${resolvedName}`);
  console.log(`🏷️ Tag / IdNumber:     ${resolvedRfidCode}`);
  console.log(`🎫 Tracking Token:     ${token}`);
  console.log(`🌐 Temp Browser URL:   ${mapUrl}`);
  console.log("=========================================================\n");

  return { token, mapUrl, tokenData };
}

async function getLivePathByToken(tokenInput) {
  const token = (tokenInput || "").trim();

  // ── Always do a fresh DB lookup for accurate IdNumberHex ─────────────────
  // We cannot rely on the tokenMap cache because IdNumber may have been stored
  // with incorrect encoding (e.g. "09]ú" gets garbled by JS string handling).
  // SQL Server computes the correct hex directly via CONVERT(VARBINARY, IdNumber).
  let visitorName = "Visitor";
  let idManagementId = null;
  let tagCodeToUse = token; // fallback: use the token string itself

  let isExpired = false;
  let companyName = null;

  try {
    const IdManagement = require("../models/IDManagement.model");
    const dbRecord = await IdManagement.findByToken(token);

    if (dbRecord) {
      visitorName = dbRecord.VisitorName || "Visitor";
      idManagementId = dbRecord.IdManagementID;
      companyName = dbRecord.Company || dbRecord.CompanyName || null;

      const now = new Date();
      let validUntilDate = null;
      if (dbRecord.ValidUntil) {
        validUntilDate = dbRecord.ValidUntil instanceof Date
          ? dbRecord.ValidUntil
          : new Date(String(dbRecord.ValidUntil).replace(" ", "T"));
      }

      const isSameDayVisit =
        new Date(dbRecord.ValidFrom || dbRecord.CreatedAt).toDateString() === now.toDateString() ||
        (validUntilDate && validUntilDate.toDateString() === now.toDateString());

      // Determine session validity:
      // Active if Status is Active (or null), tag is assigned, and has not passed midnight
      const hasAssignedTag = Boolean(dbRecord.IdNumber && String(dbRecord.IdNumber).trim() !== "");
      const isPastMidnight =
        validUntilDate &&
        !isNaN(validUntilDate.getTime()) &&
        validUntilDate.getTime() < now.getTime() &&
        !isSameDayVisit;
      const isExplicitlyEnded =
        dbRecord.Status === "Completed" ||
        dbRecord.Status === "Revoked" ||
        dbRecord.Status === "Expired";

      if (isExplicitlyEnded || !hasAssignedTag || isPastMidnight) {
        isExpired = true;
      } else {
        isExpired = false;
      }

      if (dbRecord.IdNumber && dbRecord.IdNumber.trim() && dbRecord.IdNumber.trim() !== token) {
        tagCodeToUse = idNumberToHex8(dbRecord.IdNumber.trim()) || dbRecord.IdNumber.trim();
      } else if (dbRecord.RfidCode && dbRecord.RfidCode.trim() && dbRecord.RfidCode.trim() !== token) {
        tagCodeToUse = dbRecord.RfidCode.trim();
      }

      console.log(`✅ [TOKEN→TAG] Token: ${token} | Using: ${tagCodeToUse} | Visitor: ${visitorName} | Expired: ${isExpired}`);

      // Update tokenMap for non-blocking use elsewhere
      tokenMap.set(token, { token, idManagementId, tagCode: tagCodeToUse, visitorName, isExpired });
    } else {
      console.log(`⚠️ [TOKEN→TAG] Token ${token} not found in DB — using token as tagCode`);
    }
  } catch (dbErr) {
    console.error("⚠️ [TOKEN RESOLUTION] DB lookup error:", dbErr.message);
    // Fall back to cached tokenMap if DB fails
    const cached = tokenMap.get(token);
    if (cached?.hex8FromSQL) tagCodeToUse = cached.hex8FromSQL;
    else if (cached?.tagCode && cached.tagCode !== token) tagCodeToUse = cached.tagCode;
    if (cached?.isExpired) isExpired = true;
  }

  const livePath = await getLivePathForTag(tagCodeToUse);
  return {
    ...livePath,
    visitorName:    visitorName || livePath.visitorName,
    company:        companyName || livePath.company,
    token,
    idManagementId,
    isExpired,
  };
}


function getAllReaders() {
  return getReadersList();
}

module.exports = {
  getAllReaders,
  updateScan,
  getLivePathForTag,
  generateQrToken,
  getLivePathByToken,
};
