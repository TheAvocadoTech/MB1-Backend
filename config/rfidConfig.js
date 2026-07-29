/**
 * Centralized RFID Tracking Configuration
 * SINGLE SOURCE OF TRUTH for active visitor tracking tag.
 * To change the default fallback tag across the entire system, update DEFAULT_TRACKING_TAG below.
 */

const DEFAULT_TRACKING_TAG = process.env.DEFAULT_TRACKING_TAG || "V001";
const RFID_STREAM_URL = process.env.RFID_STREAM_URL || "http://16.170.141.146:5000/data";
const POLL_INTERVAL_MS = parseInt(process.env.RFID_POLL_INTERVAL_MS || "1000", 10);

/**
 * Get fallback visitor record for unassigned/hardcoded tag tracking
 * @param {string} [tagInput] - Tag code or ID
 * @returns {object} Standard visitor fallback object
 */
function getDefaultVisitorFallback(tagInput) {
  const tag = (tagInput || DEFAULT_TRACKING_TAG).trim().toUpperCase();
  return {
    VisitorName: `Visitor ${tag}`,
    IdNumber: tag,
    IdManagementID: 9001,
    Company: "Active Visitor",
    Purpose: "Course Navigation",
  };
}

module.exports = {
  DEFAULT_TRACKING_TAG,
  RFID_STREAM_URL,
  POLL_INTERVAL_MS,
  getDefaultVisitorFallback,
};
