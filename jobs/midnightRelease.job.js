// jobs/midnightRelease.job.js
const IdManagement = require("../models/IDManagement.model");

let midnightTimer = null;

/**
 * Run auto-release check for expired visitor passes
 */
async function checkAndReleaseExpiredVisits() {
  try {
    await IdManagement.autoReleaseExpiredVisits();
  } catch (err) {
    console.error("❌ [MIDNIGHT JOB] Error checking expired visits:", err.message);
  }
}

/**
 * Start the Midnight Auto-Release Background Job
 * Checks every 60 seconds and auto-releases all visits that passed 12 AM midnight
 */
function startMidnightReleaseJob() {
  // Run an immediate check on startup to clean any leftover passes from previous days
  checkAndReleaseExpiredVisits();

  // Run periodic check every 60 seconds
  const INTERVAL_MS = 60 * 1000;
  midnightTimer = setInterval(checkAndReleaseExpiredVisits, INTERVAL_MS);

  console.log("🌙 [MIDNIGHT JOB] Automatic 12:00 AM Tag Auto-Release job started (interval: 60s)");
}

function stopMidnightReleaseJob() {
  if (midnightTimer) {
    clearInterval(midnightTimer);
    midnightTimer = null;
  }
}

module.exports = {
  startMidnightReleaseJob,
  stopMidnightReleaseJob,
  checkAndReleaseExpiredVisits,
};
