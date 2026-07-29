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
function asciiToHexPrefix(label) {
  if (!label) return null;
  const up = label.trim().toUpperCase();
  // Already an 8-char hex string?
  if (/^[0-9A-F]{8}$/.test(up)) return up;
  // ASCII label → convert first 4 bytes to hex
  return Buffer.from(up.substring(0, 4), "utf8").toString("hex").toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY STATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Primary state map:   tagId (8-char hex prefix) → scan state object
 *
 * e.g.  latestTagState.get("56303032")  →  { tagId, machineNumber, location, coords, received_at, … }
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
 * Expected input (from poller):
 *   { tagId: "56303032",  machine_number: "29",  received_at: "2026-07-29T18:38:32.334Z" }
 *
 * Logic:
 *   1. tagId  = first 8 hex chars of rfid_code  (already extracted by poller)
 *   2. Find reader whose id === Number(machine_number) in rfidReaders.json
 *   3. ALWAYS store this scan — the poller guarantees it is the latest scan
 *      from the current live buffer, so we trust it unconditionally.
 *   4. Persist to SQL (non-blocking) for audit log
 *
 * @returns {object}  updated state object
 */
async function updateScan({ tagId, machine_number, received_at }) {
  if (!tagId || !machine_number) return null;

  const key = tagId.toUpperCase();
  const scanTime = received_at ? new Date(received_at) : new Date();
  const reader = findReaderById(machine_number);

  const state = {
    tagId:         key,
    machineNumber: Number(machine_number),
    readerId:      reader ? reader.id      : Number(machine_number),
    sequence:      reader ? reader.sequence : 1,
    location:      reader ? reader.location : "Unknown Location",
    coords:        reader ? reader.coords   : { x: 12, y: 82 },
    received_at:   scanTime.toISOString(),
  };

  latestTagState.set(key, state);

  console.log(
    `📡 [RFID TRACKER] Tag '${key}' → Reader #${state.readerId} ` +
    `(${state.location}) [Seq ${state.sequence}] @ ${state.received_at}`
  );

  // Persist to SQL (non-blocking — failure must not stop live tracking)
  try {
    const RfidLogModel = require("../models/RfidLog.model");
    await RfidLogModel.createLog({
      rfid_code:      key,
      machine_number: machine_number,
      location:       state.location,
      received_at:    state.received_at,
    });
  } catch (_) { /* non-blocking */ }

  return state;
}

/**
 * Return the full live-path response for a given tag identifier.
 *
 * Accepts any of these formats for tagCodeInput:
 *   • ASCII label   "V002"
 *   • 8-char hex    "56303032"
 *   • Full EPC      "563030327CA0BB0BE0411D00"  (prefix will be used)
 *
 * @param {string} [tagCodeInput]
 */
async function getLivePathForTag(tagCodeInput) {
  const readersList = getReadersList();
  const rawInput = (tagCodeInput || rfidConfig.DEFAULT_TRACKING_TAG).trim().toUpperCase();

  // Resolve the 8-char hex prefix key that the state map uses
  let key;
  if (rawInput.length >= 8 && /^[0-9A-F]+$/.test(rawInput)) {
    // Already hex (full EPC or prefix) — take first 8 chars
    key = rawInput.substring(0, 8);
  } else {
    // ASCII label e.g. "V002" → convert to hex prefix "56303032"
    key = asciiToHexPrefix(rawInput);
  }

  // ── State lookup ──────────────────────────────────────────────────────────
  const currentState = key ? latestTagState.get(key) : null;

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
    tagId:             key,
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
        const freshCode  = (visitor.RfidCode || visitor.IdNumber || "").trim().toUpperCase();
        if (freshCode) resolvedRfidCode = freshCode;
        console.log(
          `🔎 [QR TOKEN] DB cross-check for #${idManagementId}: ` +
          `Visitor='${resolvedName}', RfidCode='${resolvedRfidCode}'`
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

  const mapUrl = `http://192.168.20.10:7000/temp/?token=${token}`;
  console.log("\n=========================================================");
  console.log("🔑 [VISITOR QR TOKEN GENERATED]");
  if (resolvedIdMgmtId) console.log(`📋 DB IdManagementID:  #${resolvedIdMgmtId}`);
  console.log(`📌 Visitor Name:       ${resolvedName}`);
  console.log(`🏷️ RFID Tag Code:      ${resolvedRfidCode}`);
  console.log(`🎫 Tracking Token:     ${token}`);
  console.log(`🌐 Temp Browser URL:   ${mapUrl}`);
  console.log("=========================================================\n");

  return { token, mapUrl, tokenData };
}

async function getLivePathByToken(tokenInput) {
  const token = (tokenInput || "").trim();
  let tokenData = tokenMap.get(token);

  if (!tokenData) {
    try {
      const IdManagement = require("../models/IDManagement.model");
      const dbRecord = await IdManagement.findByToken(token);
      if (dbRecord) {
        tokenData = {
          token,
          idManagementId: dbRecord.IdManagementID,
          tagCode: (dbRecord.RfidCode || dbRecord.IdNumber || token).trim().toUpperCase(),
          visitorName: dbRecord.VisitorName || "Visitor",
        };
        tokenMap.set(token, tokenData);
      }
    } catch (dbErr) {
      console.error("⚠️ [TOKEN RESOLUTION] DB lookup error:", dbErr.message);
    }
  }

  if (!tokenData) {
    return await getLivePathForTag(token || rfidConfig.DEFAULT_TRACKING_TAG);
  }

  let tagCodeToUse = tokenData.tagCode;

  if (tokenData.idManagementId) {
    try {
      const IdManagement = require("../models/IDManagement.model");
      const visitor = await IdManagement.getVisitorWithRfid(tokenData.idManagementId);
      if (visitor) {
        const freshCode = (visitor.RfidCode || visitor.IdNumber || tagCodeToUse).trim().toUpperCase();
        if (freshCode !== tagCodeToUse) {
          tokenData.tagCode = freshCode;
          tagCodeToUse      = freshCode;
        }
        tokenData.visitorName = visitor.VisitorName || tokenData.visitorName;
      }
    } catch (dbErr) {
      console.error("⚠️ [TOKEN REFRESH] DB re-check failed:", dbErr.message);
    }
  }

  const livePath = await getLivePathForTag(tagCodeToUse);
  return {
    ...livePath,
    visitorName:   tokenData.visitorName || livePath.visitorName,
    token:         tokenData.token,
    idManagementId: tokenData.idManagementId,
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
