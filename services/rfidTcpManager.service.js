const net = require("net");
const readersList = require("../config/rfidReaders.json");
const { parseRRUHFR03Hex } = require("../utils/rfidHexParser");
const rfidTrackerService = require("./rfidTracker.service");

// Active TCP Socket connections map: Key = ip -> Value = Socket
const activeSockets = new Map();

/**
 * Connect to a single RRUHFR03 Reader over TCP/IP (Option 1: Backend -> Reader)
 */
function connectToReader(reader) {
  const { ip, port, location, id } = reader;
  if (!ip || !port) return;

  console.log(`🔌 [TCP MANAGER] Attempting connection to Reader #${id} (${location}) at ${ip}:${port}...`);

  const client = net.createConnection({ host: ip, port: port, timeout: 5000 }, () => {
    console.log(`✅ [TCP MANAGER] Connected to Reader #${id} (${location}) at ${ip}:${port}`);
    activeSockets.set(ip, client);
  });

  client.on("data", (data) => {
    const rawHex = data.toString("hex").toUpperCase();
    console.log(`📥 [TCP MANAGER] Network payload from ${location} (${ip}): ${rawHex}`);

    try {
      const parsed = parseRRUHFR03Hex(rawHex);
      rfidTrackerService.updateScan({
        epc: parsed.epc,
        readerId: parsed.readerId || id,
        received_at: parsed.timestamp,
        rawHex: parsed.rawHex,
      });
    } catch (err) {
      console.error(`❌ [TCP MANAGER] Parse error from ${ip}:`, err.message);
    }
  });

  client.on("error", (err) => {
    console.warn(`⚠️ [TCP MANAGER] Connection issue with ${location} (${ip}): ${err.message}`);
  });

  client.on("close", () => {
    activeSockets.delete(ip);
    console.log(`🔄 [TCP MANAGER] Connection closed for ${ip}. Retrying in 10s...`);
    setTimeout(() => connectToReader(reader), 10000);
  });

  client.on("timeout", () => {
    client.destroy();
  });
}

/**
 * Initialize TCP Connection Manager for all 15 Readers in 192.168.30.x subnet
 */
function initAllReaders() {
  console.log("🌐 [TCP MANAGER] Initializing network socket connections for 15 RFID readers...");
  readersList.forEach((reader) => {
    connectToReader(reader);
  });
}

module.exports = {
  initAllReaders,
  connectToReader,
};
