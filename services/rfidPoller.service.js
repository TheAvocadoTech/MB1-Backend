const http = require("http");
const rfidTrackerService = require("./rfidTracker.service");
const rfidConfig = require("../config/rfidConfig");

const DATA_URL = rfidConfig.RFID_STREAM_URL;
const POLL_INTERVAL_MS = rfidConfig.POLL_INTERVAL_MS;

let pollerTimer = null;

/**
 * One fetch-and-process cycle:
 *  1. GET the live data from 16.170.141.146:5000/data
 *  2. Group entries by rfid_code across ALL active tags in stream
 *  3. Pick the latest scan (newest received_at) for each tag
 *  4. Update in-memory live tracking state via rfidTrackerService.updateScan()
 */
function fetchRfidStream() {
  const req = http.get(DATA_URL, (res) => {
    let rawData = "";

    res.on("data", (chunk) => { rawData += chunk; });

    res.on("end", async () => {
      try {
        if (res.statusCode !== 200) {
          console.warn(`⚠️ [RFID POLLER] HTTP ${res.statusCode} from stream`);
          return;
        }

        const parsed = JSON.parse(rawData);
        if (!parsed.success || !Array.isArray(parsed.data)) return;

        // Group scans by rfid_code
        const tagMap = new Map();

        for (const scan of parsed.data) {
          if (!scan || !scan.rfid_code || !scan.machine_number) continue;
          const codeKey = scan.rfid_code.trim().toUpperCase();

          const existing = tagMap.get(codeKey);
          if (!existing || new Date(scan.received_at) > new Date(existing.received_at)) {
            tagMap.set(codeKey, scan);
          }
        }

        // Update state for all tags present in current live buffer
        for (const [codeKey, latestScan] of tagMap.entries()) {
          await rfidTrackerService.updateScan({
            tagId:          codeKey,
            machine_number: latestScan.machine_number,
            received_at:    latestScan.received_at,
          });
        }

      } catch (err) {
        console.error("❌ [RFID POLLER] Stream parse error:", err.message);
      }
    });
  });

  req.on("error", (err) => {
    console.warn(`⚠️ [RFID POLLER] Connection error (${DATA_URL}):`, err.message);
  });

  req.setTimeout(5000, () => {
    req.destroy();
    console.warn("⚠️ [RFID POLLER] Request timed out — retrying next interval");
  });
}

function startPoller() {
  console.log(`🌐 [RFID POLLER] Live tracking poller active → polling ${DATA_URL} every ${POLL_INTERVAL_MS}ms`);
  fetchRfidStream();
  if (!pollerTimer) {
    pollerTimer = setInterval(fetchRfidStream, POLL_INTERVAL_MS);
  }
}

function stopPoller() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
    console.log("⏹️ [RFID POLLER] Stopped");
  }
}

module.exports = { startPoller, stopPoller, fetchRfidStream };

