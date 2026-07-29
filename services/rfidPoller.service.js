const http = require("http");
const rfidTrackerService = require("./rfidTracker.service");
const rfidConfig = require("../config/rfidConfig");

const DATA_URL = rfidConfig.RFID_STREAM_URL;
const POLL_INTERVAL_MS = rfidConfig.POLL_INTERVAL_MS;

// The 8-char hex prefix of the tag we are tracking (e.g. "56303032" = V002)
// Derived once from DEFAULT_TRACKING_TAG so we don't recompute every poll
const TARGET_TAG_HEX = Buffer.from(
  rfidConfig.DEFAULT_TRACKING_TAG.substring(0, 4),
  "utf8"
).toString("hex").toUpperCase();  // "V002" -> "56303032"

let pollerTimer = null;

/**
 * One fetch-and-process cycle:
 *  1. GET the live data from 16.170.141.146:5000/data
 *  2. Filter entries whose rfid_code starts with TARGET_TAG_HEX
 *  3. Sort filtered entries by received_at DESC → take the first (= most recent)
 *  4. Pass that single scan to rfidTrackerService.updateScan()
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

        // ── Find the LATEST scan for our target tag in the current buffer ──
        const tagScans = parsed.data.filter(
          (s) => s.rfid_code && s.rfid_code.toUpperCase().startsWith(TARGET_TAG_HEX)
        );

        if (tagScans.length === 0) return; // tag not in current buffer — keep existing state

        // Sort newest-first and pick the top entry
        tagScans.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
        const latest = tagScans[0];

        await rfidTrackerService.updateScan({
          tagId:          TARGET_TAG_HEX,          // 8-char hex key, e.g. "56303032"
          machine_number: latest.machine_number,   // reader id from stream
          received_at:    latest.received_at,       // timestamp of this scan
        });

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
  console.log(
    `🌐 [RFID POLLER] Tracking tag '${rfidConfig.DEFAULT_TRACKING_TAG}' ` +
    `(hex prefix: ${TARGET_TAG_HEX}) → polling ${DATA_URL} every ${POLL_INTERVAL_MS}ms`
  );
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
