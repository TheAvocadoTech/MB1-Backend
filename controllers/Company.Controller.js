// controllers/CompanyController.js
const Company = require("../models/Company.model");

/* ===========================
   CREATE COMPANY
=========================== */

const createCompany = async (req, res) => {
  try {
    console.log("📥 Create company request:", req.body);

    const {
      companyName,
      contactPerson,
      email,
      phone,
      address,
      industry,
      website,
    } = req.body;

    // Validate required fields
    if (!companyName) {
      return res.status(400).json({
        success: false,
        message: "Company name is required.",
      });
    }

    // Create company
    const company = await Company.create({
      companyName,
      contactPerson: contactPerson || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      industry: industry || null,
      website: website || null,
      createdBy: req.user?.userId || null,
    });

    res.status(201).json({
      success: true,
      message: "Company added successfully.",
      company,
    });
  } catch (err) {
    console.error("❌ Create company error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET ALL COMPANIES
=========================== */

const getAllCompanies = async (req, res) => {
  try {
    const { search, industry, page = 1, limit = 10 } = req.query;
    console.log(`🏢 [COMPANY CTRL] getAllCompanies requested with params:`, { search, industry, page, limit });

    const filters = {
      search: search || null,
      industry: industry || null,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    };

    const companies = await Company.findAll(filters);
    const total = await Company.count(search);

    console.log(`   ✅ Returning ${companies.length} companies out of ${total} total.`);

    res.json({
      success: true,
      companies,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("❌ Get all companies error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET COMPANY BY ID
=========================== */

const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Company ID is required.",
      });
    }

    const company = await Company.findById(parseInt(id));

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found.",
      });
    }

    res.json({
      success: true,
      company,
    });
  } catch (err) {
    console.error("❌ Get company error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   UPDATE COMPANY
=========================== */

const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Company ID is required.",
      });
    }

    // Check if company exists
    const existingCompany = await Company.findById(parseInt(id));
    if (!existingCompany) {
      return res.status(404).json({
        success: false,
        message: "Company not found.",
      });
    }

    // Update company
    const updatedCompany = await Company.update(parseInt(id), updateData);

    if (!updatedCompany) {
      return res.status(404).json({
        success: false,
        message: "Company not found or already deleted.",
      });
    }

    res.json({
      success: true,
      message: "Company updated successfully.",
      company: updatedCompany,
    });
  } catch (err) {
    console.error("❌ Update company error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   DELETE COMPANY
=========================== */

const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Company ID is required.",
      });
    }

    // Check if company exists
    const existingCompany = await Company.findById(parseInt(id));
    if (!existingCompany) {
      return res.status(404).json({
        success: false,
        message: "Company not found.",
      });
    }

    // Delete company (soft delete)
    const deleted = await Company.delete(parseInt(id));

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Company not found.",
      });
    }

    res.json({
      success: true,
      message: "Company deleted successfully.",
    });
  } catch (err) {
    console.error("❌ Delete company error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET INDUSTRIES
=========================== */

const getIndustries = async (req, res) => {
  try {
    const industries = await Company.getIndustries();

    res.json({
      success: true,
      industries,
    });
  } catch (err) {
    console.error("❌ Get industries error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   SEARCH COMPANIES
=========================== */

const searchCompanies = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Search term is required.",
      });
    }

    const companies = await Company.search(q);

    res.json({
      success: true,
      companies,
    });
  } catch (err) {
    console.error("❌ Search companies error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET RECENT COMPANIES
=========================== */

const getRecentCompanies = async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const companies = await Company.getRecent(parseInt(limit));

    res.json({
      success: true,
      companies,
    });
  } catch (err) {
    console.error("❌ Get recent companies error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET COMPANIES BY INDUSTRY
=========================== */

const getCompaniesByIndustry = async (req, res) => {
  try {
    const { industry } = req.params;

    if (!industry) {
      return res.status(400).json({
        success: false,
        message: "Industry is required.",
      });
    }

    const companies = await Company.findByIndustry(industry);

    res.json({
      success: true,
      companies,
    });
  } catch (err) {
    console.error("❌ Get companies by industry error:", err);
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
  createCompany,
  getAllCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  getIndustries,
  searchCompanies,
  getRecentCompanies,
  getCompaniesByIndustry,
};
