const express = require("express");
const router = express.Router();
const rfidController = require("../controllers/rfid.controller");

// Run DB migration: ensure RfidCode column exists on IdManagement table
const IdManagement = require("../models/IDManagement.model");
IdManagement.ensureRfidCodeColumn().catch((e) => console.error("RfidCode column migration error:", e));

// Ingest raw hex packet string from RRUHFR03 reader
router.post("/raw-hex", rfidController.ingestRawHex);

// Ingest parsed RFID scan payload
router.post("/scan", rfidController.ingestScan);

// Generate QR Token for visitor & log to console (cross-checks DB by idManagementId)
router.post("/generate-qr", rfidController.generateQr);

// Assign RFID badge code to a visitor's IdManagement record
router.post("/assign-rfid", rfidController.assignRfid);

// Get live position & shortened path by QR Token
router.get("/live-token/:token", rfidController.getLivePathByToken);

// Get live position & shortened path for a tag (defaults to single centralized fallback tag if omitted)
router.get("/live/:tagCode?", rfidController.getLivePath);

// Get 15 RFID readers route map configuration
router.get("/readers", rfidController.getReaders);

// Get RFID scan logs stored in SQL Server Database
router.get("/logs", rfidController.getLogs);

module.exports = router;
