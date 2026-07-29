const http = require("http");
const rfidTrackerService = require("./rfidTracker.service");

const DATA_URL = process.env.RFID_STREAM_URL || "http://16.170.141.146:5000/data";
const POLL_INTERVAL_MS = parseInt(process.env.RFID_POLL_INTERVAL_MS || "1000", 10); // Poll every 1 second

let pollerTimer = null;

function fetchRfidStream() {
  const req = http.get(DATA_URL, (res) => {
    let rawData = "";

    res.on("data", (chunk) => {
      rawData += chunk;
    });

    res.on("end", async () => {
      try {
        if (res.statusCode !== 200) {
          console.warn(`⚠️ [RFID POLLER] HTTP ${res.statusCode} from stream URL`);
          return;
        }

        const parsed = JSON.parse(rawData);
        if (!parsed.success || !Array.isArray(parsed.data)) return;

        // Group scans by tag: find the LATEST scan per unique RFID tag in the window
        // This prevents re-processing duplicates and ensures we only update with newest data
        const latestPerTag = new Map();
        for (const scan of parsed.data) {
          if (!scan.rfid_code || !scan.machine_number) continue;
          const tag = scan.rfid_code.toUpperCase();
          const scanTime = new Date(scan.received_at);
          const existing = latestPerTag.get(tag);
          if (!existing || scanTime > new Date(existing.received_at)) {
            latestPerTag.set(tag, scan);
          }
        }

        // Update tracker with only the latest scan per tag
        let updateCount = 0;
        for (const [, scan] of latestPerTag) {
          try {
            const updated = await rfidTrackerService.updateScan({
              rfid_code: scan.rfid_code,
              machine_number: scan.machine_number,
              received_at: scan.received_at,
            });
            if (updated) updateCount++;
          } catch (err) {
            // Silently ignore individual scan errors
          }
        }

        if (updateCount > 0 && process.env.NODE_ENV !== "production") {
          console.log(`📡 [RFID POLLER] Updated ${updateCount} tag(s) from live stream (${latestPerTag.size} unique tags in window)`);
        }
      } catch (err) {
        console.error("❌ [RFID POLLER] Stream parse error:", err.message);
      }
    });
  });

  req.on("error", (err) => {
    console.warn(`⚠️ [RFID POLLER] Stream connection issue (${DATA_URL}):`, err.message);
  });

  // Timeout: abort if no response in 5 seconds to prevent hanging
  req.setTimeout(5000, () => {
    req.destroy();
    console.warn("⚠️ [RFID POLLER] Stream request timed out — will retry next interval");
  });
}

/**
 * Start automatic periodic polling of the external RFID data stream
 */
function startPoller() {
  console.log(`🌐 [RFID POLLER] Starting live stream poller → ${DATA_URL} (Interval: ${POLL_INTERVAL_MS}ms)`);
  // Immediate initial fetch
  fetchRfidStream();
  // Recurring timer
  if (!pollerTimer) {
    pollerTimer = setInterval(fetchRfidStream, POLL_INTERVAL_MS);
  }
}

/**
 * Stop automatic polling
 */
function stopPoller() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
    console.log("⏹️ [RFID POLLER] Stream poller stopped");
  }
}

module.exports = {
  startPoller,
  stopPoller,
  fetchRfidStream,
};
