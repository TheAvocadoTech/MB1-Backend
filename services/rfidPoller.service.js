const http = require("http");
const rfidTrackerService = require("./rfidTracker.service");

const DATA_URL = process.env.RFID_STREAM_URL || "http://16.170.141.146:5000/data";
const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds

let pollerTimer = null;
let lastProcessedTime = null;

function fetchRfidStream() {
  http
    .get(DATA_URL, (res) => {
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
          if (parsed.success && Array.isArray(parsed.data)) {
            let updateCount = 0;
            // Process incoming scans from oldest to newest so latest scan sets final position
            const sortedScans = [...parsed.data].reverse();
            for (const scan of sortedScans) {
              if (scan.rfid_code && scan.machine_number) {
                try {
                  await rfidTrackerService.updateScan({
                    rfid_code: scan.rfid_code,
                    machine_number: scan.machine_number,
                    received_at: scan.received_at,
                  });
                  updateCount++;
                } catch (err) {
                  // Silently ignore individual scan formatting errors
                }
              }
            }
            if (updateCount > 0 && process.env.NODE_ENV !== "production") {
              console.log(`📡 [RFID POLLER] Synchronized ${updateCount} scans from external stream (${DATA_URL})`);
            }
          }
        } catch (err) {
          console.error("❌ [RFID POLLER] Stream parse error:", err.message);
        }
      });
    })
    .on("error", (err) => {
      console.warn(`⚠️ [RFID POLLER] Stream connection issue (${DATA_URL}):`, err.message);
    });
}

/**
 * Start automatic periodic polling of the external RFID data stream
 */
function startPoller() {
  console.log(`🌐 [RFID POLLER] Starting stream poller -> ${DATA_URL} (Interval: ${POLL_INTERVAL_MS}ms)`);
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
