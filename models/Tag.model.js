// models/Tag.model.js
const { connectDB, sql } = require("../config/db");

class Tag {
  /**
   * Create a new ID tag
   * @param {Object} tagData
   * @param {string} tagData.idNumber - Tag identifier/code (e.g. 'V001', 'Tag 1')
   * @param {string} tagData.nickname - Nickname for dropdown display (e.g. 'Visitor Badge 1')
   * @param {number} tagData.createdBy - User ID who created
   * @returns {Promise<Object>}
   */
  static async create(tagData) {
    try {
      const { idNumber, nickname, createdBy } = tagData;

      if (!idNumber) throw new Error("ID Name/Number is required");
      if (!nickname) throw new Error("Nickname is required");

      const cleanIdNumber = String(idNumber).trim();
      const cleanNickname = String(nickname).trim();

      const pool = await connectDB();

      // Check if tag with same IdNumber already exists and is active
      const existing = await pool
        .request()
        .input("idNumber", sql.NVarChar, cleanIdNumber)
        .query("SELECT TagID FROM IdTags WHERE IdNumber = @idNumber AND IsActive = 1");

      if (existing.recordset.length > 0) {
        throw new Error(`An ID Tag with name '${cleanIdNumber}' already exists.`);
      }

      const result = await pool
        .request()
        .input("idNumber", sql.NVarChar, cleanIdNumber)
        .input("nickname", sql.NVarChar, cleanNickname)
        .input("createdBy", sql.Int, createdBy || null)
        .query(`
          INSERT INTO IdTags (IdNumber, Nickname, CreatedBy)
          OUTPUT INSERTED.*
          VALUES (@idNumber, @nickname, @createdBy)
        `);

      return result.recordset[0];
    } catch (err) {
      console.error("Error creating tag:", err);
      throw err;
    }
  }

  /**
   * Get all ID tags with their live availability status today
   * A tag is in use if assigned to a visitor whose ValidUntil > GETDATE() and Status = 'Active'
   * @returns {Promise<Array>}
   */
  static async findAll() {
    try {
      const pool = await connectDB();
      const result = await pool.request().query(`
        SELECT 
          t.TagID,
          t.IdNumber,
          t.Nickname,
          t.IsActive,
          t.CreatedAt,
          t.UpdatedAt,
          activeVis.IdManagementID as ActiveVisitorID,
          activeVis.VisitorName as AssignedVisitorName,
          activeVis.Company as AssignedCompany,
          activeVis.ValidUntil as ActiveUntil,
          CASE 
            WHEN activeVis.IdManagementID IS NOT NULL THEN 0 
            ELSE 1 
          END as IsAvailable
        FROM IdTags t
        OUTER APPLY (
          SELECT TOP 1 
            i.IdManagementID,
            i.VisitorName,
            i.Company,
            i.ValidUntil
          FROM IdManagement i
          WHERE i.IdNumber = t.IdNumber 
            AND i.IsActive = 1 
            AND i.Status = 'Active'
            AND (i.ValidUntil IS NULL OR i.ValidUntil > GETDATE())
          ORDER BY i.CreatedAt DESC
        ) activeVis
        WHERE t.IsActive = 1
        ORDER BY t.CreatedAt DESC
      `);

      return result.recordset.map((r) => ({
        tagId: r.TagID,
        idNumber: r.IdNumber,
        nickname: r.Nickname,
        isAvailable: r.IsAvailable === 1,
        status: r.IsAvailable === 1 ? "Available" : "Assigned",
        assignedVisitorName: r.AssignedVisitorName || null,
        assignedCompany: r.AssignedCompany || null,
        activeUntil: r.ActiveUntil || null,
        createdAt: r.CreatedAt,
      }));
    } catch (err) {
      console.error("Error fetching all tags:", err);
      throw err;
    }
  }

  /**
   * Get only available ID tags for visitor assignment dropdown
   * Returns tags that are NOT assigned to any active non-expired visitor today
   * @returns {Promise<Array>}
   */
  static async findAvailable() {
    const allTags = await this.findAll();
    return allTags.filter((t) => t.isAvailable);
  }

  /**
   * Find tag by ID
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    try {
      const pool = await connectDB();
      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .query("SELECT * FROM IdTags WHERE TagID = @id AND IsActive = 1");
      return result.recordset[0] || null;
    } catch (err) {
      console.error("Error finding tag by ID:", err);
      throw err;
    }
  }

  /**
   * Update an ID tag
   * @param {number} id
   * @param {Object} updateData
   * @returns {Promise<Object|null>}
   */
  static async update(id, updateData) {
    try {
      const { idNumber, nickname } = updateData;
      if (!idNumber && !nickname) throw new Error("No fields to update");

      const pool = await connectDB();
      const request = pool.request().input("id", sql.Int, id);

      let setClauses = ["UpdatedAt = GETDATE()"];
      if (idNumber) {
        setClauses.push("IdNumber = @idNumber");
        request.input("idNumber", sql.NVarChar, String(idNumber).trim());
      }
      if (nickname) {
        setClauses.push("Nickname = @nickname");
        request.input("nickname", sql.NVarChar, String(nickname).trim());
      }

      const query = `
        UPDATE IdTags
        SET ${setClauses.join(", ")}
        OUTPUT INSERTED.*
        WHERE TagID = @id AND IsActive = 1
      `;

      const result = await request.query(query);
      return result.recordset[0] || null;
    } catch (err) {
      console.error("Error updating tag:", err);
      throw err;
    }
  }

  /**
   * Soft delete an ID tag
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  static async delete(id) {
    try {
      const pool = await connectDB();
      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .query("UPDATE IdTags SET IsActive = 0, DeletedAt = GETDATE() WHERE TagID = @id");

      return result.rowsAffected[0] > 0;
    } catch (err) {
      console.error("Error deleting tag:", err);
      throw err;
    }
  }
}

module.exports = Tag;
