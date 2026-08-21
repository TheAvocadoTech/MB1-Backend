// routes/IdManagement.routes.js
const express = require("express");
const router = express.Router();
const {
  createIdRecord,
  getAllIdRecords,
  getIdRecordById,
  getIdRecordsByPhone,
  updateIdRecord,
  deleteIdRecord,
  getActiveIdRecords,
  getExpiredIdRecords,
  getIdStats,
  getAllTags,
  getAvailableTags,
  createTag,
  updateTag,
  deleteTag,
  assignTagToVisitor,
  endVisitorVisit,
} = require("../controllers/IDManagment.Controller");

const { protect, admin } = require("../middleware/auth.middleware");

/* ===========================
   TAG / BADGE ROUTES
=========================== */

// Get available tags for visitor dropdown (Public / Protected)
router.get("/tags/available", getAvailableTags);

// Get all tags
router.get("/tags", getAllTags);

// Create tag
router.post("/tags", protect, createTag);

// Update tag
router.put("/tags/:id", protect, updateTag);

// Delete tag
router.delete("/tags/:id", protect, deleteTag);

/* ===========================
   VISITOR ON VISIT / TAG ASSIGNMENT ROUTES
=========================== */

// Assign tag to visitor for today's visit (On Visit button)
router.put("/:id/assign-tag", protect, assignTagToVisitor);

// End visit early for visitor (releases tag)
router.put("/:id/end-visit", protect, endVisitorVisit);

/* ===========================
   PUBLIC ROUTES (No authentication required)
=========================== */

// Get ID records by phone number
router.get("/phone/:phone", getIdRecordsByPhone);

// Get all active ID records
router.get("/active", getActiveIdRecords);

// Get all expired ID records
router.get("/expired", getExpiredIdRecords);

// Get ID statistics
router.get("/stats", getIdStats);

/* ===========================
   PROTECTED ROUTES (Authentication required)
=========================== */

// Create a new ID record
router.post("/", protect, createIdRecord);

// Get all ID records with filters
router.get("/", protect, getAllIdRecords);

// Get ID record by ID
router.get("/:id", protect, getIdRecordById);

// Update ID record
router.put("/:id", protect, updateIdRecord);

// Delete ID record
router.delete("/:id", protect, deleteIdRecord);

module.exports = router;
