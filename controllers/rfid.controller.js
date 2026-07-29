const { parseRRUHFR03Hex } = require("../utils/rfidHexParser");
const rfidTrackerService = require("../services/rfidTracker.service");

/**
 * Ingest Raw Hex string from RRUHFR03 Reader
 * POST /api/rfid/raw-hex
 * Body: { rawHex: "BB13E04106000000000CE28011B0A502006E81D29C8C4698" }
 */
exports.ingestRawHex = async (req, res) => {
  try {
    const { rawHex, hex } = req.body;
    const inputHex = rawHex || hex;

    if (!inputHex) {
      return res.status(400).json({ success: false, message: "Missing rawHex in request body" });
    }

    const parsed = parseRRUHFR03Hex(inputHex);
    const updatedState = rfidTrackerService.updateScan({
      epc: parsed.epc,
      readerId: parsed.readerId,
      rawHex: parsed.rawHex,
      received_at: parsed.timestamp,
    });

    return res.status(200).json({
      success: true,
      message: "RFID raw hex processed and location updated",
      data: {
        parsed,
        currentState: updatedState,
      },
    });
  } catch (error) {
    console.error("❌ [RFID CONTROLLER] Ingest Raw Hex Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Ingest Parsed RFID Scan
 * POST /api/rfid/scan
 * Body: { rfid_code: "...", machine_number: "46", received_at: "..." }
 */
exports.ingestScan = async (req, res) => {
  try {
    const { rfid_code, epc, machine_number, readerId, received_at } = req.body;

    const tagCode = epc || rfid_code;
    const readerNum = readerId || machine_number;

    if (!tagCode || !readerNum) {
      return res.status(400).json({
        success: false,
        message: "Both rfid_code/epc and machine_number/readerId are required",
      });
    }

    const updatedState = rfidTrackerService.updateScan({
      epc: tagCode,
      machine_number: readerNum,
      received_at: received_at || new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "RFID scan recorded successfully",
      currentState: updatedState,
    });
  } catch (error) {
    console.error("❌ [RFID CONTROLLER] Ingest Scan Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get Live Path and Remaining Route for a Tag
 * GET /api/rfid/live/:tagCode
 */
exports.getLivePath = async (req, res) => {
  try {
    const { tagCode } = req.params;
    if (!tagCode) {
      return res.status(400).json({ success: false, message: "Tag code parameter is required" });
    }

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const liveData = await rfidTrackerService.getLivePathForTag(tagCode);
    return res.status(200).json({
      success: true,
      data: liveData,
    });
  } catch (error) {
    console.error("❌ [RFID CONTROLLER] Get Live Path Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Generate QR Token for Visitor
 * POST /api/rfid/generate-qr
 * Body: { idManagementId, visitorName?, rfidCode? }
 *
 * Priority: idManagementId (DB cross-check) > rfidCode (direct)
 */
exports.generateQr = async (req, res) => {
  try {
    const { idManagementId, visitorName, rfidCode, tagCode } = req.body;

    if (!idManagementId && !rfidCode && !tagCode) {
      return res.status(400).json({
        success: false,
        message: "Either idManagementId or rfidCode is required",
      });
    }

    const result = await rfidTrackerService.generateQrToken({
      idManagementId: idManagementId ? parseInt(idManagementId) : null,
      visitorName,
      rfidCode: rfidCode || tagCode,
    });

    return res.status(201).json({
      success: true,
      message: "QR Code Token generated successfully",
      token: result.token,
      mapUrl: result.mapUrl,
      data: result.tokenData,
    });
  } catch (error) {
    console.error("❌ [RFID CONTROLLER] Generate QR Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Assign RFID badge code to a visitor's IdManagement record
 * POST /api/rfid/assign-rfid
 * Body: { idManagementId, rfidCode }
 */
exports.assignRfid = async (req, res) => {
  try {
    const { idManagementId, rfidCode } = req.body;
    if (!idManagementId || !rfidCode) {
      return res.status(400).json({
        success: false,
        message: "idManagementId and rfidCode are both required",
      });
    }
    const IdManagement = require("../models/IDManagement.model");
    const updated = await IdManagement.assignRfidCode(parseInt(idManagementId), rfidCode);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Visitor record not found" });
    }
    return res.status(200).json({
      success: true,
      message: `RFID badge '${rfidCode}' assigned to ${updated.VisitorName}`,
      data: updated,
    });
  } catch (error) {
    console.error("❌ [RFID CONTROLLER] Assign RFID Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get Live Path by QR Token (DB cross-checks visitor's assigned RfidCode each call)
 * GET /api/rfid/live-token/:token
 */
exports.getLivePathByToken = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ success: false, message: "Token parameter is required" });
    }

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // Async: cross-checks visitor's DB record to get fresh RfidCode each poll
    const liveData = await rfidTrackerService.getLivePathByToken(token);
    return res.status(200).json({
      success: true,
      data: liveData,
    });
  } catch (error) {
    console.error("❌ [RFID CONTROLLER] Get Live Path by Token Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get All 15 RFID Readers Configuration
 * GET /api/rfid/readers
 */
exports.getReaders = async (req, res) => {
  try {
    const readers = rfidTrackerService.getAllReaders();
    return res.status(200).json({
      success: true,
      readers,
    });
  } catch (error) {
    console.error("❌ [RFID CONTROLLER] Get Readers Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get RFID Scan Logs stored in SQL Server Database
 * GET /api/rfid/logs
 */
exports.getLogs = async (req, res) => {
  try {
    const RfidLogModel = require("../models/RfidLog.model");
    const logs = await RfidLogModel.getAllLogs();
    return res.status(200).json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    console.error("❌ [RFID CONTROLLER] Get Logs Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
