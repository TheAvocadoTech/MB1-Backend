// models/IdManagement.model.js
const { connectDB, sql } = require("../config/db");

class IdManagement {
  /**
   * Create a new ID record
   * @param {Object} idData - ID data
   * @param {string} idData.visitorName - Visitor's full name
   * @param {string} idData.phoneNumber - Visitor's phone number
   * @param {string} idData.email - Visitor's email
   * @param {string} idData.company - Company name
   * @param {string} idData.purpose - Purpose of visit
   * @param {string} idData.idType - ID type (Visitor/Employee/Contractor)
   * @param {string} idData.idNumber - ID card number
   * @param {Date} idData.validFrom - Valid from date
   * @param {Date} idData.validUntil - Valid until date
   * @param {number} idData.createdBy - User ID who created
   * @param {string} idData.status - Status (Active/Expired/Revoked)
   * @returns {Promise<Object>} Created ID object
   */
  static async create(idData) {
    try {
      const {
        visitorName,
        phoneNumber,
        email,
        company,
        purpose,
        idType = "Visitor",
        idNumber,
        validFrom,
        validUntil,
        createdBy,
        status = "Active",
      } = idData;

      // Validate required fields
      if (!visitorName) {
        throw new Error("Visitor name is required");
      }
      if (!phoneNumber) {
        throw new Error("Phone number is required");
      }

      // Calculate midnight expiry (11:59:59.999 PM of the same day)
      const startDate = validFrom ? new Date(validFrom) : new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const localMidnightStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())} 23:59:59.999`;
      
      const finalValidUntil = validUntil ? new Date(validUntil) : localMidnightStr;

      console.log("📝 Creating ID record with local midnight expiry:", {
        visitorName,
        phoneNumber,
        company,
        idNumber,
        validUntil: localMidnightStr,
      });

      const pool = await connectDB();

      // Check if this tag/idNumber is already assigned to an active visitor today
      if (idNumber && String(idNumber).trim()) {
        const checkTag = await pool
          .request()
          .input("idNumber", sql.NVarChar, String(idNumber).trim())
          .query(`
            SELECT TOP 1 IdManagementID, VisitorName, ValidUntil
            FROM IdManagement
            WHERE IdNumber = @idNumber 
              AND IsActive = 1 
              AND Status = 'Active'
              AND (ValidUntil IS NULL OR ValidUntil > GETDATE())
          `);

        if (checkTag.recordset.length > 0) {
          const activeVis = checkTag.recordset[0];
          throw new Error(
            `ID Tag '${idNumber}' is currently assigned to '${activeVis.VisitorName}' until midnight. Please choose an available ID Tag.`
          );
        }
      }

      const crypto = require("crypto");
      const generatedToken = "VTK_" + crypto.randomBytes(8).toString("hex");

      const result = await pool
        .request()
        .input("visitorName", sql.NVarChar, visitorName)
        .input("phoneNumber", sql.NVarChar, phoneNumber)
        .input("email", sql.NVarChar, email || null)
        .input("company", sql.NVarChar, company || null)
        .input("purpose", sql.NVarChar, purpose || null)
        .input("idType", sql.NVarChar, idType)
        .input("idNumber", sql.NVarChar, idNumber || null)
        .input("validFrom", sql.DateTime, startDate)
        .input("validUntil", sql.NVarChar, validUntil ? new Date(validUntil).toISOString() : localMidnightStr)
        .input("createdBy", sql.Int, createdBy || null)
        .input("status", sql.NVarChar, status)
        .input("qrToken", sql.VarChar(100), generatedToken)
        .query(`
                    INSERT INTO IdManagement (
                        VisitorName,
                        PhoneNumber,
                        Email,
                        Company,
                        Purpose,
                        IdType,
                        IdNumber,
                        ValidFrom,
                        ValidUntil,
                        CreatedBy,
                        Status,
                        QrToken
                    )
                    OUTPUT INSERTED.*
                    VALUES (
                        @visitorName,
                        @phoneNumber,
                        @email,
                        @company,
                        @purpose,
                        @idType,
                        @idNumber,
                        @validFrom,
                        @validUntil,
                        @createdBy,
                        @status,
                        @qrToken
                    )
                `);

      const createdRecord = result.recordset[0];

      const mapUrl = `http://localhost:3000/temp/?token=${generatedToken}`;

      console.log("\n=========================================================");
      console.log("🔑 [VISITOR QR TOKEN CREATED & STORED IN DATABASE]");
      console.log(`📋 IdManagementID:    #${createdRecord.IdManagementID}`);
      console.log(`📌 Visitor Name:       ${createdRecord.VisitorName}`);
      console.log(`🎫 Tracking Token:     ${generatedToken}`);
      console.log(`🌐 Temp Browser URL:   ${mapUrl}`);
      console.log("=========================================================\n");

      return {
        ...createdRecord,
        token: generatedToken,
        mapUrl,
      };
    } catch (err) {
      console.error("Error creating ID record:", err);
      throw err;
    }
  }

  /**
   * Get all ID records with filters
   * @param {Object} filters - Filter options
   * @param {string} filters.search - Search term
   * @param {string} filters.status - Filter by status
   * @param {string} filters.idType - Filter by ID type
   * @param {string} filters.sortBy - Sort by column
   * @param {string} filters.sortOrder - Sort order (ASC/DESC)
   * @returns {Promise<Array>} Array of ID objects
   */
  static async findAll(filters = {}) {
    try {
      let query = `
                SELECT 
                    i.*,
                    u.FullName as CreatedByName
                FROM IdManagement i
                LEFT JOIN Users u ON i.CreatedBy = u.UserID
                WHERE i.IsActive = 1
            `;

      const request = new sql.Request();

      // Add search filter
      if (filters.search) {
        query += `
                    AND (
                        i.VisitorName LIKE @search 
                        OR i.PhoneNumber LIKE @search
                        OR i.Email LIKE @search
                        OR i.Company LIKE @search
                        OR i.IdNumber LIKE @search
                    )
                `;
        request.input("search", sql.NVarChar, `%${filters.search}%`);
      }

      // Add status filter
      if (filters.status) {
        query += ` AND i.Status = @status`;
        request.input("status", sql.NVarChar, filters.status);
      }

      // Add ID type filter
      if (filters.idType) {
        query += ` AND i.IdType = @idType`;
        request.input("idType", sql.NVarChar, filters.idType);
      }

      // Add sorting
      const validSortColumns = [
        "VisitorName",
        "PhoneNumber",
        "Company",
        "IdType",
        "Status",
        "CreatedAt",
      ];
      const sortColumn = validSortColumns.includes(filters.sortBy)
        ? filters.sortBy
        : "CreatedAt";
      const sortOrder = filters.sortOrder === "DESC" ? "DESC" : "DESC";
      query += ` ORDER BY i.${sortColumn} ${sortOrder}`;

      console.log("📊 Executing ID query with filters:", filters);

      const pool = await connectDB();
      const result = await request.query(query);

      const TEMP_BROWSER_BASE =
        process.env.TEMP_BROWSER_BASE_URL || "http://localhost:3000/temp";
      const now = new Date();

      const records = result.recordset.map((r) => {
        let validUntilDate = null;
        if (r.ValidUntil) {
          validUntilDate = r.ValidUntil instanceof Date
            ? r.ValidUntil
            : new Date(String(r.ValidUntil).replace(" ", "T"));
        }

        const isCurrentlyActive =
          r.Status === "Active" &&
          validUntilDate &&
          !isNaN(validUntilDate.getTime()) &&
          validUntilDate.getTime() > now.getTime();

        const token = r.QrToken || null;
        const mapUrl = token ? `${TEMP_BROWSER_BASE}/?token=${token}` : null;

        return {
          ...r,
          isOnVisit: isCurrentlyActive,
          activeTagNumber: isCurrentlyActive ? r.IdNumber : null,
          activeCompany: isCurrentlyActive ? r.Company : null,
          token: token,
          mapUrl: mapUrl,
        };
      });

      return records;
    } catch (err) {
      console.error("Error finding ID records:", err);
      throw err;
    }
  }

  /**
   * Find ID record by ID
   * @param {number} id - ID record ID
   * @returns {Promise<Object|null>} ID object or null
   */
  static async findById(id) {
    try {
      const pool = await connectDB();
      const result = await pool.request().input("id", sql.Int, id).query(`
                    SELECT 
                        i.*,
                        u.FullName as CreatedByName
                    FROM IdManagement i
                    LEFT JOIN Users u ON i.CreatedBy = u.UserID
                    WHERE i.IdManagementID = @id AND i.IsActive = 1
                `);
      return result.recordset[0] || null;
    } catch (err) {
      console.error("Error finding ID record by ID:", err);
      throw err;
    }
  }

  /**
   * Find ID records by phone number
   * @param {string} phoneNumber - Phone number
   * @returns {Promise<Array>} Array of ID objects
   */
  static async findByPhone(phoneNumber) {
    try {
      const pool = await connectDB();
      const result = await pool
        .request()
        .input("phoneNumber", sql.NVarChar, phoneNumber).query(`
                    SELECT * FROM IdManagement 
                    WHERE PhoneNumber = @phoneNumber AND IsActive = 1
                    ORDER BY CreatedAt DESC
                `);
      return result.recordset;
    } catch (err) {
      console.error("Error finding ID records by phone:", err);
      throw err;
    }
  }

  /**
   * Update ID record
   * @param {number} id - ID record ID
   * @param {Object} updateData - Fields to update
   * @returns {Promise<Object|null>} Updated ID object or null
   */
  static async update(id, updateData) {
    try {
      const updates = {};

      // Map field names
      if (updateData.visitorName !== undefined)
        updates.VisitorName = updateData.visitorName;
      if (updateData.phoneNumber !== undefined)
        updates.PhoneNumber = updateData.phoneNumber;
      if (updateData.email !== undefined) updates.Email = updateData.email;
      if (updateData.company !== undefined)
        updates.Company = updateData.company;
      if (updateData.purpose !== undefined)
        updates.Purpose = updateData.purpose;
      if (updateData.idType !== undefined) updates.IdType = updateData.idType;
      if (updateData.idNumber !== undefined)
        updates.IdNumber = updateData.idNumber;
      if (updateData.validFrom !== undefined)
        updates.ValidFrom = updateData.validFrom;
      if (updateData.validUntil !== undefined)
        updates.ValidUntil = updateData.validUntil;
      if (updateData.status !== undefined) updates.Status = updateData.status;
      if (updateData.isActive !== undefined)
        updates.IsActive = updateData.isActive;

      if (Object.keys(updates).length === 0) {
        throw new Error("No fields to update");
      }

      // Build dynamic update query
      const keys = Object.keys(updates);
      const setClause = keys.map((key) => `${key} = @${key}`).join(", ");

      const pool = await connectDB();
      const request = pool.request().input("id", sql.Int, id);

      keys.forEach((key) => {
        const value = updates[key];
        if (key === "IsActive") {
          request.input(key, sql.Bit, value);
        } else if (key === "ValidFrom" || key === "ValidUntil") {
          request.input(key, sql.DateTime, value);
        } else {
          request.input(key, sql.NVarChar, value);
        }
      });

      const query = `
                UPDATE IdManagement 
                SET ${setClause}, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE IdManagementID = @id AND IsActive = 1
            `;

      const result = await request.query(query);

      if (result.recordset.length === 0) {
        return null;
      }

      console.log("✅ ID record updated successfully");
      return result.recordset[0];
    } catch (err) {
      console.error("Error updating ID record:", err);
      throw err;
    }
  }

  /**
   * Soft delete ID record (mark as inactive)
   * @param {number} id - ID record ID
   * @returns {Promise<boolean>} True if deleted
   */
  static async delete(id) {
    try {
      const pool = await connectDB();
      const result = await pool.request().input("id", sql.Int, id).query(`
                    UPDATE IdManagement 
                    SET IsActive = 0, DeletedAt = GETDATE()
                    WHERE IdManagementID = @id
                `);

      const deleted = result.rowsAffected[0] > 0;
      if (deleted) {
        console.log(`🗑️ ID record ${id} deleted successfully`);
      }
      return deleted;
    } catch (err) {
      console.error("Error deleting ID record:", err);
      throw err;
    }
  }

  /**
   * Get active ID records
   * @returns {Promise<Array>} Array of active ID objects
   */
  static async findActive() {
    try {
      const pool = await connectDB();
      const result = await pool.request().query(`
                    SELECT * FROM IdManagement 
                    WHERE Status = 'Active' AND IsActive = 1
                    ORDER BY CreatedAt DESC
                `);

      const TEMP_BROWSER_BASE =
        process.env.TEMP_BROWSER_BASE_URL || "http://localhost:3000/temp";

      const now = new Date();

      const records = result.recordset.map((r) => {
        let validUntilDate = null;
        if (r.ValidUntil) {
          validUntilDate = r.ValidUntil instanceof Date
            ? r.ValidUntil
            : new Date(String(r.ValidUntil).replace(" ", "T"));
        }

        const isCurrentlyActive =
          r.Status === "Active" &&
          validUntilDate &&
          !isNaN(validUntilDate.getTime()) &&
          validUntilDate.getTime() > now.getTime();

        const token = r.QrToken || null;
        const mapUrl = token ? `${TEMP_BROWSER_BASE}/?token=${token}` : null;

        return {
          ...r,
          isOnVisit: isCurrentlyActive,
          activeTagNumber: isCurrentlyActive ? r.IdNumber : null,
          activeCompany: isCurrentlyActive ? r.Company : null,
          token: token,
          mapUrl: mapUrl,
        };
      });

      return records;
    } catch (err) {
      console.error("Error fetching ID records:", err);
      throw err;
    }
  }

  /**
   * Assign an ID tag to a permanent visitor for today's visit (expires at 12 AM midnight IST)
   * @param {number} idManagementId
   * @param {Object} data
   * @param {string} data.idNumber
   * @returns {Promise<Object>}
   */
  static async assignTag(idManagementId, data) {
    try {
      const { idNumber, company } = data;
      if (!idNumber || !String(idNumber).trim()) {
        throw new Error("ID Tag / Number is required to check in visitor.");
      }

      const cleanId = String(idNumber).trim();
      const cleanCompany = company ? String(company).trim() : null;
      const pool = await connectDB();

      // Check if tag is currently assigned to another active visitor today
      const checkTag = await pool
        .request()
        .input("idNumber", sql.NVarChar, cleanId)
        .input("currentId", sql.Int, idManagementId)
        .query(`
          SELECT TOP 1 IdManagementID, VisitorName
          FROM IdManagement
          WHERE IdNumber = @idNumber 
            AND IdManagementID != @currentId
            AND IsActive = 1 
            AND Status = 'Active'
            AND (ValidUntil IS NULL OR ValidUntil > GETDATE())
        `);

      if (checkTag.recordset.length > 0) {
        const activeVis = checkTag.recordset[0];
        throw new Error(
          `ID Tag '${cleanId}' is currently assigned to '${activeVis.VisitorName}' until 12 AM midnight. Please choose an available ID Tag.`
        );
      }

      // Calculate midnight expiry string (23:59:59.999 PM IST of today)
      const startDate = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const localMidnightStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())} 23:59:59.999`;

      const crypto = require("crypto");
      const generatedToken = "VTK_" + crypto.randomBytes(8).toString("hex");

      const result = await pool
        .request()
        .input("id", sql.Int, idManagementId)
        .input("idNumber", sql.NVarChar, cleanId)
        .input("company", sql.NVarChar, cleanCompany)
        .input("validFrom", sql.DateTime, startDate)
        .input("validUntil", sql.NVarChar, localMidnightStr)
        .input("qrToken", sql.VarChar(100), generatedToken)
        .query(`
          UPDATE IdManagement
          SET IdNumber = @idNumber,
              Company = @company,
              ValidFrom = @validFrom,
              ValidUntil = @validUntil,
              Status = 'Active',
              QrToken = @qrToken,
              UpdatedAt = GETDATE()
          OUTPUT INSERTED.*
          WHERE IdManagementID = @id AND IsActive = 1
        `);

      if (result.recordset.length === 0) {
        throw new Error("Visitor record not found.");
      }

      const record = result.recordset[0];
      const TEMP_BROWSER_BASE =
        process.env.TEMP_BROWSER_BASE_URL || "http://localhost:3000/temp";
      const token = record.QrToken || generatedToken;

      return {
        ...record,
        isOnVisit: true,
        activeTagNumber: record.IdNumber,
        activeCompany: record.Company,
        token: token,
        mapUrl: `${TEMP_BROWSER_BASE}/?token=${token}`,
      };
    } catch (err) {
      console.error("Error assigning tag to visitor:", err);
      throw err;
    }
  }

  /**
   * End visit early (releases tag before midnight)
   * @param {number} idManagementId
   * @returns {Promise<Object>}
   */
  static async endVisit(idManagementId) {
    try {
      const pool = await connectDB();
      const result = await pool
        .request()
        .input("id", sql.Int, idManagementId)
        .query(`
          UPDATE IdManagement
          SET ValidUntil = GETDATE(),
              Status = 'Completed',
              IdNumber = NULL,
              Company = NULL,
              UpdatedAt = GETDATE()
          OUTPUT INSERTED.*
          WHERE IdManagementID = @id AND IsActive = 1
        `);

      return result.recordset[0] || null;
    } catch (err) {
      console.error("Error ending visit:", err);
      throw err;
    }
  }

  /**
   * Get expired ID records
   * @returns {Promise<Array>} Array of expired ID objects
   */
  static async findExpired() {
    try {
      const pool = await connectDB();
      const result = await pool.request().query(`
                    SELECT * FROM IdManagement 
                    WHERE Status = 'Expired' AND IsActive = 1
                    ORDER BY ValidUntil ASC
                `);
      return result.recordset;
    } catch (err) {
      console.error("Error finding expired ID records:", err);
      throw err;
    }
  }

  /**
   * Count total ID records
   * @param {string} status - Filter by status
   * @returns {Promise<number>} Total number of records
   */
  static async count(status = null) {
    try {
      let query = `SELECT COUNT(*) as total FROM IdManagement WHERE IsActive = 1`;
      const request = new sql.Request();

      if (status) {
        query += ` AND Status = @status`;
        request.input("status", sql.NVarChar, status);
      }

      const pool = await connectDB();
      const result = await request.query(query);
      return result.recordset[0].total;
    } catch (err) {
      console.error("Error counting ID records:", err);
      throw err;
    }
  }

  /**
   * Get ID statistics
   * @returns {Promise<Object>} Statistics object
   */
  static async getStats() {
    try {
      const pool = await connectDB();
      const result = await pool.request().query(`
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN Status = 'Active' THEN 1 ELSE 0 END) as active,
                        SUM(CASE WHEN Status = 'Expired' THEN 1 ELSE 0 END) as expired,
                        SUM(CASE WHEN Status = 'Revoked' THEN 1 ELSE 0 END) as revoked,
                        SUM(CASE WHEN IdType = 'Visitor' THEN 1 ELSE 0 END) as visitors,
                        SUM(CASE WHEN IdType = 'Employee' THEN 1 ELSE 0 END) as employees,
                        SUM(CASE WHEN IdType = 'Contractor' THEN 1 ELSE 0 END) as contractors
                    FROM IdManagement 
                    WHERE IsActive = 1
                `);
      return result.recordset[0];
    } catch (err) {
      console.error("Error getting ID stats:", err);
      throw err;
    }
  }

  /**
   * Helper utility: Normalize RFID code into both raw string and Hex representation
   * @param {string} code - Badge code input (can be text like 'v001', decimal number, or raw hex)
   * @returns {{ raw: string, hex: string }} Both normal text and hex values
   */
  static normalizeRfidFormats(code) {
    if (!code) return { raw: "", hex: "", prefixHex: "", asciiTag: "" };
    const rawCode = String(code).trim();
    const str = rawCode.toUpperCase();
    const isHex = /^[0-9A-FA-F]+$/.test(str);

    let raw = rawCode;
    let hex = str;
    let prefixHex = isHex && str.length >= 8 ? str.substring(0, 8) : "";
    let asciiTag = rawCode;

    if (isHex && str.length >= 8) {
      hex = str;
      prefixHex = str.substring(0, 8);
      // Try latin1 decoding for single-byte tag labels (e.g. '30395DFA' -> '09]ú')
      try {
        const decodedLatin1 = Buffer.from(prefixHex, "hex").toString("latin1").trim();
        if (decodedLatin1.length >= 2 && !/[\x00-\x1F\x7F]/.test(decodedLatin1)) {
          asciiTag = decodedLatin1;
          raw = decodedLatin1;
        }
      } catch (e) {}

      // Try utf8 decoding as fallback
      try {
        const decodedUtf8 = Buffer.from(prefixHex, "hex").toString("utf8").trim();
        if (decodedUtf8.length >= 2 && !/[\x00-\x1F\x7F\uFFFD]/.test(decodedUtf8)) {
          asciiTag = decodedUtf8;
          raw = decodedUtf8;
        }
      } catch (e) {}
    } else {
      // Plain text or tag string (e.g. '09]ú' or 'V002') -> convert to Hex via latin1
      asciiTag = rawCode;
      raw = rawCode;
      const sub = rawCode.substring(0, 4);
      const latin1Hex = Buffer.from(sub, "latin1").toString("hex").toUpperCase();
      if (latin1Hex.length === 8) {
        prefixHex = latin1Hex;
        hex = Buffer.from(rawCode, "latin1").toString("hex").toUpperCase();
      } else {
        hex = Buffer.from(rawCode, "utf8").toString("hex").toUpperCase();
        prefixHex = hex.substring(0, 8);
      }
    }

    return { raw, hex, prefixHex, asciiTag };
  }

  /**
   * Ensure RfidCode, RfidCodeHex, and QrToken columns exist on IdManagement table (safe migration)
   * Called once at startup — adds columns only if they don't already exist
   */
  static async ensureRfidCodeColumn() {
    try {
      const pool = await connectDB();
      await pool.request().query(`
        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'IdManagement' AND COLUMN_NAME = 'RfidCode'
        )
        BEGIN
          ALTER TABLE IdManagement ADD RfidCode VARCHAR(100) NULL;
        END

        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'IdManagement' AND COLUMN_NAME = 'RfidCodeHex'
        )
        BEGIN
          ALTER TABLE IdManagement ADD RfidCodeHex VARCHAR(100) NULL;
        END

        IF NOT EXISTS (
          SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'IdManagement' AND COLUMN_NAME = 'QrToken'
        )
        BEGIN
          ALTER TABLE IdManagement ADD QrToken VARCHAR(100) NULL;
        END
      `);
      console.log("✅ [SQL MODEL] IdManagement (RfidCode, RfidCodeHex & QrToken) columns verified/ready");
    } catch (err) {
      console.error("❌ [SQL MODEL] Error ensuring columns on IdManagement:", err);
    }
  }

  /**
   * Find IdManagement record by QrToken string
   * @param {string} token - QrToken
   * @returns {Promise<Object|null>} Record or null, with extra IdNumberHex field computed by SQL
   */
  static async findByToken(token) {
    try {
      const pool = await connectDB();
      const cleanToken = (token || "").trim();
      const { raw, hex } = IdManagement.normalizeRfidFormats(cleanToken);

      const result = await pool
        .request()
        .input("token", sql.VarChar(100), cleanToken)
        .input("raw", sql.VarChar(100), raw)
        .input("hex", sql.VarChar(100), hex)
        .query(`
          SELECT TOP 1 i.*
          FROM IdManagement i
          WHERE (i.QrToken = @token OR i.IdNumber = @token OR i.IdNumber = @raw OR i.RfidCode = @raw OR i.RfidCodeHex = @hex OR i.RfidCode = @hex OR i.RfidCodeHex = @raw) AND i.IsActive = 1
        `);
      return result.recordset[0] || null;
    } catch (err) {
      console.error("❌ [SQL MODEL] Error finding record by token:", err);
      throw err;
    }
  }

  /**
   * Assign an RFID badge code to an existing IdManagement record
   * Stores both the normal text representation and the Hex-converted value.
   * @param {number} idManagementId - IdManagementID primary key
   * @param {string} rfidCode - RFID EPC/badge code to assign
   * @returns {Promise<Object|null>} Updated record or null
   */
  static async assignRfidCode(idManagementId, rfidCode) {
    try {
      const { raw, hex } = this.normalizeRfidFormats(rfidCode);
      const pool = await connectDB();
      const result = await pool
        .request()
        .input("id", sql.Int, idManagementId)
        .input("rfidCode", sql.VarChar(100), raw)
        .input("rfidCodeHex", sql.VarChar(100), hex)
        .query(`
          UPDATE IdManagement
          SET RfidCode = @rfidCode, RfidCodeHex = @rfidCodeHex
          WHERE IdManagementID = @id AND IsActive = 1;

          SELECT i.*, u.FullName as CreatedByName
          FROM IdManagement i
          LEFT JOIN Users u ON i.CreatedBy = u.UserID
          WHERE i.IdManagementID = @id AND i.IsActive = 1;
        `);
      const updated = result.recordset[0] || null;
      if (updated) {
        console.log(`✅ [SQL MODEL] RfidCode '${raw}' (Hex: '${hex}') assigned to IdManagementID #${idManagementId} (${updated.VisitorName})`);
      }
      return updated;
    } catch (err) {
      console.error("❌ [SQL MODEL] Error assigning RfidCode:", err);
      throw err;
    }
  }

  /**
   * Find an IdManagement record by RFID badge code (checks both normal value and hex conversion)
   * @param {string} rfidCode - RFID EPC/badge code
   * @returns {Promise<Object|null>} ID record or null
   */
  static async findByRfidCode(rfidCode) {
    try {
      const { raw, hex, prefixHex, asciiTag } = this.normalizeRfidFormats(rfidCode);
      const pool = await connectDB();
      const result = await pool
        .request()
        .input("raw", sql.VarChar(100), raw)
        .input("hex", sql.VarChar(100), hex)
        .input("prefixHex", sql.VarChar(100), prefixHex || "")
        .input("asciiTag", sql.VarChar(100), asciiTag || "")
        .query(`
          SELECT i.*, u.FullName as CreatedByName
          FROM IdManagement i
          LEFT JOIN Users u ON i.CreatedBy = u.UserID
          WHERE (
            i.IdNumber = @asciiTag OR i.IdNumber = @raw
            OR i.RfidCode = @raw OR i.RfidCodeHex = @hex
            OR i.RfidCode = @hex OR i.RfidCodeHex = @raw
            OR i.RfidCode = @asciiTag OR i.RfidCodeHex = @prefixHex
            OR (LEN(@prefixHex) >= 8 AND (i.RfidCode LIKE @prefixHex + '%' OR i.RfidCodeHex LIKE @prefixHex + '%'))
            OR (LEN(@prefixHex) >= 8 AND (i.IdNumber LIKE @asciiTag + '%'))
          ) AND i.IsActive = 1
          ORDER BY i.CreatedAt DESC
        `);
      return result.recordset[0] || null;
    } catch (err) {
      console.error("❌ [SQL MODEL] Error finding record by RfidCode:", err);
      throw err;
    }
  }

  /**
   * Get visitor info + assigned IdNumber/RfidCode for a given IdManagement record ID
   * @param {number} idManagementId - Primary key
   * @returns {Promise<Object|null>} Record with IdNumber/RfidCode or null
   */
  static async getVisitorWithRfid(idManagementId) {
    try {
      const pool = await connectDB();
      const result = await pool
        .request()
        .input("id", sql.Int, idManagementId)
        .query(`
          SELECT i.IdManagementID, i.VisitorName, i.PhoneNumber, i.Company,
                 i.Purpose, i.IdType, i.Status, i.IdNumber, i.RfidCode, i.RfidCodeHex, i.ValidFrom, i.ValidUntil
          FROM IdManagement i
          WHERE i.IdManagementID = @id AND i.IsActive = 1
        `);
      return result.recordset[0] || null;
    } catch (err) {
      console.error("❌ [SQL MODEL] Error getting visitor with RFID:", err);
      throw err;
    }
  }
}

module.exports = IdManagement;
