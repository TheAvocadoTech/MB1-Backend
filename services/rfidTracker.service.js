const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const RfidLogModel = require("../models/RfidLog.model");

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
          tagCode: dbRecord.RfidCode || "E28011B0A502006E81D29C8",
          visitorName: dbRecord.VisitorName || "Visitor",
        };
        tokenMap.set(token, tokenData);
      }
    } catch (dbErr) {
      console.error("⚠️ [TOKEN RESOLUTION] DB lookup error:", dbErr.message);
    }
  }

  if (!tokenData) {
    // Unknown token — fall back to using it as a direct RFID tag code
    return getLivePathForTag(token);
  }

  let tagCodeToUse = tokenData.tagCode;

  // --- DB Cross-check: Re-verify the visitor's current assigned RfidCode ---
  if (tokenData.idManagementId) {
    try {
      const IdManagement = require("../models/IDManagement.model");
      const visitor = await IdManagement.getVisitorWithRfid(tokenData.idManagementId);
      if (visitor && visitor.RfidCode) {
        const freshCode = visitor.RfidCode.trim().toUpperCase();
        if (freshCode !== tagCodeToUse) {
          console.log(
            `🔄 [TOKEN REFRESH] RfidCode updated for IdManagementID #${tokenData.idManagementId}: ` +
            `'${tagCodeToUse}' -> '${freshCode}'`
          );
          tokenData.tagCode = freshCode;
          tagCodeToUse = freshCode;
        }
      }
    } catch (dbErr) {
      console.error("⚠️ [TOKEN REFRESH] DB re-check failed, using cached tagCode:", dbErr.message);
    }
  }

  const livePath = getLivePathForTag(tagCodeToUse);
  return {
    ...livePath,
    visitorName: tokenData.visitorName,
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
 * ONLY updates if timestamp is newer than existing stored timestamp
 */
function updateScan({ rfid_code, epc, machine_number, readerId, received_at, rawHex }) {
  const tagCode = (epc || rfid_code || "").trim().toUpperCase();
  const targetReaderId = readerId || machine_number;

  if (!tagCode) {
    throw new Error("Missing RFID tag code / EPC");
  }

  const reader = findReader(targetReaderId);
  const scanTime = received_at ? new Date(received_at) : new Date();

  // 1. Asynchronously log EVERY scan event to SQL Server Database
  RfidLogModel.createLog({
    rfid_code: tagCode,
    machine_number: reader ? reader.id : targetReaderId,
    location: reader ? reader.location : "Unknown Location",
    received_at: scanTime.toISOString(),
    rawHex: rawHex || null,
  }).catch((err) => console.error("❌ SQL Log Error:", err));

  // 2. Compare timestamps in-memory: update ONLY if newer or no existing state
  const IdManagement = require("../models/IDManagement.model");
  const { raw, hex } = IdManagement.normalizeRfidFormats(tagCode);
  const existingState = latestTagState.get(tagCode) || latestTagState.get(raw) || latestTagState.get(hex);

  if (!existingState || scanTime >= new Date(existingState.received_at)) {
    const updatedState = {
      tagCode: raw || tagCode,
      tagCodeHex: hex || tagCode,
      readerId: reader ? reader.id : targetReaderId,
      sequence: reader ? reader.sequence : 1,
      location: reader ? reader.location : "Unknown Location",
      coords: reader ? reader.coords : { x: 12, y: 82 },
      received_at: scanTime.toISOString(),
      rawHex: rawHex || null,
    };

    latestTagState.set(tagCode, updatedState);
    if (raw) latestTagState.set(raw, updatedState);
    if (hex) latestTagState.set(hex, updatedState);

    console.log(
      `📡 [RFID TRACKER] Tag '${raw}' (Hex: '${hex}') updated -> Reader #${updatedState.readerId} (${updatedState.location}) [Seq ${updatedState.sequence}/15]`
    );
    return updatedState;
  }

  console.log(
    `⏳ [RFID TRACKER] Tag ${tagCode} scan ignored (older timestamp ${scanTime.toISOString()})`
  );
  return existingState;
}

/**
 * Get current live position & shortened path for an RFID tag
 */
function getLivePathForTag(tagCodeInput) {
  const readersList = getReadersList();
  const rawTag = (tagCodeInput || "").trim().toUpperCase();
  const IdManagement = require("../models/IDManagement.model");
  const { raw, hex } = IdManagement.normalizeRfidFormats(rawTag);

  const currentState =
    latestTagState.get(rawTag) ||
    (raw ? latestTagState.get(raw) : null) ||
    (hex ? latestTagState.get(hex) : null);

  const currentSequence = currentState ? currentState.sequence : 1;
  const currentReader = readersList.find((r) => r.sequence === currentSequence) || readersList[0];

  const remainingPath = readersList.filter((r) => r.sequence >= currentSequence);
  const passedPath = readersList.filter((r) => r.sequence < currentSequence);

  const progressPercent = Math.round((currentSequence / readersList.length) * 100);

  return {
    tagCode,
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
