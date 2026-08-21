// models/Company.model.js
const sql = require("mssql");

class Company {
  /**
   * Create a new company
   * @param {Object} companyData - Company data
   * @param {string} companyData.companyName - Company name
   * @param {string} companyData.contactPerson - Contact person name
   * @param {string} companyData.email - Company email
   * @param {string} companyData.phone - Company phone
   * @param {string} companyData.address - Company address
   * @param {string} companyData.industry - Industry type
   * @param {string} companyData.website - Company website
   * @param {number} companyData.createdBy - User ID who created
   * @returns {Promise<Object>} Created company object
   */
  static async create(companyData) {
    try {
      const {
        companyName,
        contactPerson,
        email,
        phone,
        address,
        industry,
        website,
        createdBy,
      } = companyData;

      // Validate required fields
      if (!companyName) {
        throw new Error("Company name is required");
      }

      console.log("📝 Creating company:", { companyName });

      const pool = await sql.connect();
      const result = await pool
        .request()
        .input("companyName", sql.NVarChar, companyName)
        .input("contactPerson", sql.NVarChar, contactPerson || null)
        .input("email", sql.NVarChar, email || null)
        .input("phone", sql.NVarChar, phone || null)
        .input("address", sql.NVarChar, address || null)
        .input("industry", sql.NVarChar, industry || null)
        .input("website", sql.NVarChar, website || null)
        .input("createdBy", sql.Int, createdBy || null).query(`
                    INSERT INTO Companies (
                        CompanyName, 
                        ContactPerson, 
                        Email, 
                        Phone, 
                        Address, 
                        Industry, 
                        Website, 
                        CreatedBy
                    )
                    OUTPUT INSERTED.*
                    VALUES (
                        @companyName, 
                        @contactPerson, 
                        @email, 
                        @phone, 
                        @address, 
                        @industry, 
                        @website, 
                        @createdBy
                    )
                `);

      console.log("✅ Company created successfully");
      return result.recordset[0];
    } catch (err) {
      console.error("Error creating company:", err);
      throw err;
    }
  }

  /**
   * Get all companies
   * @param {Object} filters - Filter options
   * @param {string} filters.search - Search term
   * @param {string} filters.industry - Filter by industry
   * @param {number} filters.limit - Number of records
   * @param {number} filters.offset - Pagination offset
   * @returns {Promise<Array>} Array of company objects
   */
  static async findAll(filters = {}) {
    try {
      let query = `
                SELECT 
                    c.*,
                    u.FullName as CreatedByName
                FROM Companies c
                LEFT JOIN Users u ON c.CreatedBy = u.UserID
                WHERE c.IsActive = 1
            `;

      const request = new sql.Request();

      // Add search filter
      if (filters.search) {
        query += `
                    AND (
                        c.CompanyName LIKE @search 
                        OR c.ContactPerson LIKE @search 
                        OR c.Email LIKE @search
                    )
                `;
        request.input("search", sql.NVarChar, `%${filters.search}%`);
      }

      // Add industry filter
      if (filters.industry) {
        query += ` AND c.Industry = @industry`;
        request.input("industry", sql.NVarChar, filters.industry);
      }

      // Order by
      query += ` ORDER BY c.CompanyName ASC`;

      // Add pagination
      if (filters.limit) {
        query += ` OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
        request.input("offset", sql.Int, filters.offset || 0);
        request.input("limit", sql.Int, filters.limit);
      }

      const pool = await sql.connect();
      const result = await request.query(query);
      return result.recordset;
    } catch (err) {
      console.error("Error finding companies:", err);
      throw err;
    }
  }

  /**
   * Find company by ID
   * @param {number} id - Company ID
   * @returns {Promise<Object|null>} Company object or null
   */
  static async findById(id) {
    try {
      const pool = await sql.connect();
      const result = await pool.request().input("id", sql.Int, id).query(`
                    SELECT 
                        c.*,
                        u.FullName as CreatedByName
                    FROM Companies c
                    LEFT JOIN Users u ON c.CreatedBy = u.UserID
                    WHERE c.CompanyID = @id AND c.IsActive = 1
                `);
      return result.recordset[0] || null;
    } catch (err) {
      console.error("Error finding company by ID:", err);
      throw err;
    }
  }

  /**
   * Update company
   * @param {number} id - Company ID
   * @param {Object} updateData - Fields to update
   * @returns {Promise<Object|null>} Updated company object or null
   */
  static async update(id, updateData) {
    try {
      const updates = {};

      // Map field names
      if (updateData.companyName !== undefined)
        updates.CompanyName = updateData.companyName;
      if (updateData.contactPerson !== undefined)
        updates.ContactPerson = updateData.contactPerson;
      if (updateData.email !== undefined) updates.Email = updateData.email;
      if (updateData.phone !== undefined) updates.Phone = updateData.phone;
      if (updateData.address !== undefined)
        updates.Address = updateData.address;
      if (updateData.industry !== undefined)
        updates.Industry = updateData.industry;
      if (updateData.website !== undefined)
        updates.Website = updateData.website;
      if (updateData.isActive !== undefined)
        updates.IsActive = updateData.isActive;

      if (Object.keys(updates).length === 0) {
        throw new Error("No fields to update");
      }

      // Build dynamic update query
      const keys = Object.keys(updates);
      const setClause = keys.map((key) => `${key} = @${key}`).join(", ");

      const pool = await sql.connect();
      const request = pool.request().input("id", sql.Int, id);

      keys.forEach((key) => {
        const value = updates[key];
        if (key === "IsActive") {
          request.input(key, sql.Bit, value);
        } else {
          request.input(key, sql.NVarChar, value);
        }
      });

      const query = `
                UPDATE Companies 
                SET ${setClause}, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE CompanyID = @id AND IsActive = 1
            `;

      const result = await request.query(query);

      if (result.recordset.length === 0) {
        return null;
      }

      console.log("✅ Company updated successfully");
      return result.recordset[0];
    } catch (err) {
      console.error("Error updating company:", err);
      throw err;
    }
  }

  /**
   * Soft delete company (mark as inactive)
   * @param {number} id - Company ID
   * @returns {Promise<boolean>} True if deleted
   */
  static async delete(id) {
    try {
      const pool = await sql.connect();
      const result = await pool.request().input("id", sql.Int, id).query(`
                    UPDATE Companies 
                    SET IsActive = 0, DeletedAt = GETDATE()
                    WHERE CompanyID = @id
                `);

      const deleted = result.rowsAffected[0] > 0;
      if (deleted) {
        console.log(`🗑️ Company ${id} deleted successfully`);
      }
      return deleted;
    } catch (err) {
      console.error("Error deleting company:", err);
      throw err;
    }
  }

  /**
   * Get companies by industry
   * @param {string} industry - Industry type
   * @returns {Promise<Array>} Array of company objects
   */
  static async findByIndustry(industry) {
    try {
      const pool = await sql.connect();
      const result = await pool
        .request()
        .input("industry", sql.NVarChar, industry).query(`
                    SELECT * FROM Companies 
                    WHERE Industry = @industry AND IsActive = 1
                    ORDER BY CompanyName ASC
                `);
      return result.recordset;
    } catch (err) {
      console.error("Error finding companies by industry:", err);
      throw err;
    }
  }

  /**
   * Get all industries
   * @returns {Promise<Array>} Array of unique industries
   */
  static async getIndustries() {
    try {
      const pool = await sql.connect();
      const result = await pool.request().query(`
                    SELECT DISTINCT Industry 
                    FROM Companies 
                    WHERE IsActive = 1 AND Industry IS NOT NULL
                    ORDER BY Industry ASC
                `);
      return result.recordset.map((row) => row.Industry);
    } catch (err) {
      console.error("Error getting industries:", err);
      throw err;
    }
  }

  /**
   * Count total companies
   * @param {string} search - Search term
   * @returns {Promise<number>} Total number of companies
   */
  static async count(search = null) {
    try {
      let query = `SELECT COUNT(*) as total FROM Companies WHERE IsActive = 1`;
      const request = new sql.Request();

      if (search) {
        query += `
                    AND (
                        CompanyName LIKE @search 
                        OR ContactPerson LIKE @search
                    )
                `;
        request.input("search", sql.NVarChar, `%${search}%`);
      }

      const pool = await sql.connect();
      const result = await request.query(query);
      return result.recordset[0].total;
    } catch (err) {
      console.error("Error counting companies:", err);
      throw err;
    }
  }

  /**
   * Get recent companies
   * @param {number} limit - Number of records
   * @returns {Promise<Array>} Array of recent companies
   */
  static async getRecent(limit = 5) {
    try {
      const pool = await sql.connect();
      const result = await pool.request().input("limit", sql.Int, limit).query(`
                    SELECT TOP (@limit)
                        c.*,
                        u.FullName as CreatedByName
                    FROM Companies c
                    LEFT JOIN Users u ON c.CreatedBy = u.UserID
                    WHERE c.IsActive = 1
                    ORDER BY c.CreatedAt DESC
                `);
      return result.recordset;
    } catch (err) {
      console.error("Error getting recent companies:", err);
      throw err;
    }
  }

  /**
   * Search companies
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} Array of matching companies
   */
  static async search(searchTerm) {
    try {
      const pool = await sql.connect();
      const result = await pool
        .request()
        .input("searchTerm", sql.NVarChar, `%${searchTerm}%`).query(`
                    SELECT 
                        c.*,
                        u.FullName as CreatedByName
                    FROM Companies c
                    LEFT JOIN Users u ON c.CreatedBy = u.UserID
                    WHERE c.IsActive = 1
                    AND (
                        c.CompanyName LIKE @searchTerm 
                        OR c.ContactPerson LIKE @searchTerm
                        OR c.Email LIKE @searchTerm
                        OR c.Industry LIKE @searchTerm
                    )
                    ORDER BY c.CompanyName ASC
                `);
      return result.recordset;
    } catch (err) {
      console.error("Error searching companies:", err);
      throw err;
    }
  }
}

module.exports = Company;
