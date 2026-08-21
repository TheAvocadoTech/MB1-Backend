// controllers/IdManagementController.js
const IdManagement = require("../models/IDManagement.model");
const Tag = require("../models/Tag.model");

/* ===========================
   CREATE ID RECORD
=========================== */

const createIdRecord = async (req, res) => {
  try {
    console.log("📥 Create ID record request:", req.body);

    const {
      visitorName,
      phoneNumber,
      email,
      company,
      purpose,
      idType,
      idNumber,
      validFrom,
      validUntil,
      status,
    } = req.body;

    // Validate required fields
    if (!visitorName) {
      return res.status(400).json({
        success: false,
        message: "Visitor name is required.",
      });
    }

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required.",
      });
    }

    // Create ID record
    const idRecord = await IdManagement.create({
      visitorName,
      phoneNumber,
      email,
      company,
      purpose,
      idType: idType || "Visitor",
      idNumber,
      validFrom: validFrom || new Date(),
      validUntil,
      createdBy: req.user?.userId || null,
      status: status || "Active",
    });

    res.status(201).json({
      success: true,
      message: "ID record created successfully.",
      data: idRecord,
    });
  } catch (err) {
    console.error("❌ Create ID record error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET ALL ID RECORDS
=========================== */

const getAllIdRecords = async (req, res) => {
  try {
    const {
      search,
      status,
      idType,
      sortBy = "CreatedAt",
      sortOrder = "DESC",
    } = req.query;

    console.log(`📇 [ID MANAGE CTRL] getAllIdRecords with params:`, { search, status, idType, sortBy, sortOrder });

    const filters = {
      search: search || null,
      status: status || null,
      idType: idType || null,
      sortBy: sortBy,
      sortOrder: sortOrder.toUpperCase(),
    };

    const records = await IdManagement.findAll(filters);
    const total = await IdManagement.count(status);

    console.log(`   ✅ Returning ${records.length} ID pass records out of ${total} total.`);

    res.json({
      success: true,
      records,
      total,
      filters: {
        search: search || null,
        status: status || null,
        idType: idType || null,
        sortBy,
        sortOrder,
      },
    });
  } catch (err) {
    console.error("❌ Get all ID records error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET ID RECORD BY ID
=========================== */

const getIdRecordById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID record ID is required.",
      });
    }

    const record = await IdManagement.findById(parseInt(id));

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "ID record not found.",
      });
    }

    res.json({
      success: true,
      data: record,
    });
  } catch (err) {
    console.error("❌ Get ID record error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET ID RECORDS BY PHONE
=========================== */

const getIdRecordsByPhone = async (req, res) => {
  try {
    const { phone } = req.params;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required.",
      });
    }

    const records = await IdManagement.findByPhone(phone);

    res.json({
      success: true,
      records,
      count: records.length,
    });
  } catch (err) {
    console.error("❌ Get ID records by phone error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   UPDATE ID RECORD
=========================== */

const updateIdRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID record ID is required.",
      });
    }

    // Check if record exists
    const existingRecord = await IdManagement.findById(parseInt(id));
    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        message: "ID record not found.",
      });
    }

    // Update record
    const updatedRecord = await IdManagement.update(parseInt(id), updateData);

    if (!updatedRecord) {
      return res.status(404).json({
        success: false,
        message: "ID record not found or already deleted.",
      });
    }

    res.json({
      success: true,
      message: "ID record updated successfully.",
      data: updatedRecord,
    });
  } catch (err) {
    console.error("❌ Update ID record error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   DELETE ID RECORD
=========================== */

const deleteIdRecord = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID record ID is required.",
      });
    }

    // Check if record exists
    const existingRecord = await IdManagement.findById(parseInt(id));
    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        message: "ID record not found.",
      });
    }

    // Delete record
    const deleted = await IdManagement.delete(parseInt(id));

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "ID record not found.",
      });
    }

    res.json({
      success: true,
      message: "ID record deleted successfully.",
    });
  } catch (err) {
    console.error("❌ Delete ID record error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET ACTIVE ID RECORDS
=========================== */

const getActiveIdRecords = async (req, res) => {
  try {
    const records = await IdManagement.findActive();

    res.json({
      success: true,
      records,
      count: records.length,
    });
  } catch (err) {
    console.error("❌ Get active ID records error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET EXPIRED ID RECORDS
=========================== */

const getExpiredIdRecords = async (req, res) => {
  try {
    const records = await IdManagement.findExpired();

    res.json({
      success: true,
      records,
      count: records.length,
    });
  } catch (err) {
    console.error("❌ Get expired ID records error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET ID STATISTICS
=========================== */

const getIdStats = async (req, res) => {
  try {
    const stats = await IdManagement.getStats();
    res.json({
      success: true,
      stats,
    });
  } catch (err) {
    console.error("❌ Get ID stats error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   TAG MANAGEMENT (ID TAGS / BADGES)
=========================== */

/**
 * Get all ID Tags with live availability status
 * GET /api/IDManage/tags
 */
const getAllTags = async (req, res) => {
  try {
    const tags = await Tag.findAll();
    res.json({
      success: true,
      count: tags.length,
      tags,
    });
  } catch (err) {
    console.error("❌ Get all tags error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/**
 * Get only available (free) ID Tags for visitor dropdown
 * GET /api/IDManage/tags/available
 */
const getAvailableTags = async (req, res) => {
  try {
    const tags = await Tag.findAvailable();
    res.json({
      success: true,
      count: tags.length,
      tags,
    });
  } catch (err) {
    console.error("❌ Get available tags error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/**
 * Create new ID Tag (ID Name & Nickname)
 * POST /api/IDManage/tags
 */
const createTag = async (req, res) => {
  try {
    const { idNumber, nickname, idName } = req.body;
    const resolvedId = idNumber || idName;

    if (!resolvedId) {
      return res.status(400).json({
        success: false,
        message: "ID Name/Number is required.",
      });
    }

    if (!nickname) {
      return res.status(400).json({
        success: false,
        message: "Nickname is required.",
      });
    }

    const tag = await Tag.create({
      idNumber: resolvedId,
      nickname,
      createdBy: req.user?.userId || null,
    });

    res.status(201).json({
      success: true,
      message: "ID Tag created successfully.",
      tag,
    });
  } catch (err) {
    console.error("❌ Create tag error:", err);
    res.status(400).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/**
 * Update an ID Tag
 * PUT /api/IDManage/tags/:id
 */
const updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { idNumber, nickname, idName } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Tag ID is required.",
      });
    }

    const updated = await Tag.update(parseInt(id), {
      idNumber: idNumber || idName,
      nickname,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "ID Tag not found or deleted.",
      });
    }

    res.json({
      success: true,
      message: "ID Tag updated successfully.",
      tag: updated,
    });
  } catch (err) {
    console.error("❌ Update tag error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/**
 * Delete an ID Tag
 * DELETE /api/IDManage/tags/:id
 */
const deleteTag = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Tag ID is required.",
      });
    }

    const deleted = await Tag.delete(parseInt(id));

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "ID Tag not found.",
      });
    }

    res.json({
      success: true,
      message: "ID Tag deleted successfully.",
    });
  } catch (err) {
    console.error("❌ Delete tag error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/**
 * Assign tag to visitor for today's visit (On Visit button)
 * PUT /api/IDManage/:id/assign-tag
 */
const assignTagToVisitor = async (req, res) => {
  try {
    const { id } = req.params;
    const { idNumber, company } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Visitor ID is required.",
      });
    }

    if (!idNumber) {
      return res.status(400).json({
        success: false,
        message: "ID Tag selection is required.",
      });
    }

    const updated = await IdManagement.assignTag(parseInt(id), { idNumber, company });

    res.json({
      success: true,
      message: `Tag '${idNumber}' assigned to visitor until 12 AM midnight!`,
      data: updated,
    });
  } catch (err) {
    console.error("❌ Assign tag error:", err);
    res.status(400).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/**
 * End visit early for visitor (releases tag before midnight)
 * PUT /api/IDManage/:id/end-visit
 */
const endVisitorVisit = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Visitor ID is required.",
      });
    }

    const updated = await IdManagement.endVisit(parseInt(id));

    res.json({
      success: true,
      message: "Visit ended successfully. Tag released.",
      data: updated,
    });
  } catch (err) {
    console.error("❌ End visit error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   EXPORTS
=========================== */

module.exports = {
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
};
