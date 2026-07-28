// controllers/IdManagementController.js
const IdManagement = require("../models/IDManagement.model");

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
};
