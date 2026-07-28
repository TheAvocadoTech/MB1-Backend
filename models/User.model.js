// models/User.model.js
const sql = require("mssql");

class User {
  /**
   * Find a user by email
   * @param {string} email - User's email address
   * @returns {Promise<Object|null>} User object or null
   */
  static async findByEmail(email) {
    try {
      console.log(`🗄️ [DB User] Searching Users table for Email: "${email}"`);
      const pool = await sql.connect();
      const result = await pool
        .request()
        .input("email", sql.NVarChar, email)
        .query("SELECT * FROM Users WHERE Email = @email");
      const foundUser = result.recordset[0] || null;
      if (foundUser) {
        console.log(`   ✅ User found: ID=${foundUser.UserID}, Email=${foundUser.Email}, Role=${foundUser.Role}`);
      } else {
        console.log(`   ⚠️ No user found with Email: "${email}"`);
      }
      return foundUser;
    } catch (err) {
      console.error("❌ Error finding user by email:", err);
      throw err;
    }
  }

  /**
   * Find a user by ID
   * @param {number} id - User's ID
   * @returns {Promise<Object|null>} User object or null
   */
  static async findById(id) {
    try {
      const pool = await sql.connect();
      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .query("SELECT * FROM Users WHERE UserID = @id");
      return result.recordset[0] || null;
    } catch (err) {
      console.error("Error finding user by ID:", err);
      throw err;
    }
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @param {string} userData.fullName - User's full name
   * @param {string} userData.email - User's email
   * @param {string} userData.password - Hashed password
   * @param {string} userData.role - User's role (default: 'Receptionist')
   * @returns {Promise<Object>} Created user object
   */
  static async create(userData) {
    try {
      // Normalize field names
      const fullName =
        userData.fullName || userData.FullName || userData.fullname;
      const email = userData.email || userData.Email;
      const password = userData.password || userData.Password;
      const role = userData.role || userData.Role || "Receptionist";
      const phoneNumber =
        userData.phoneNumber ||
        userData.PhoneNumber ||
        userData.phonenumber ||
        null;
      const profileImage =
        userData.profileImage ||
        userData.ProfileImage ||
        userData.profileimage ||
        null;

      // Validate required fields
      if (!email) {
        throw new Error("Email is required");
      }
      if (!password) {
        throw new Error("Password is required");
      }
      if (!fullName) {
        throw new Error("Full name is required");
      }

      console.log("📝 Creating user with:", { fullName, email, role }); // Debug log

      const pool = await sql.connect();
      const result = await pool
        .request()
        .input("email", sql.NVarChar, email)
        .input("password", sql.NVarChar, password)
        .input("fullName", sql.NVarChar, fullName)
        .input("role", sql.NVarChar, role)
        .input("phoneNumber", sql.NVarChar, phoneNumber)
        .input("profileImage", sql.NVarChar, profileImage).query(`
                    INSERT INTO Users (Email, Password, FullName, Role, PhoneNumber, ProfileImage)
                    OUTPUT INSERTED.*
                    VALUES (@email, @password, @fullName, @role, @phoneNumber, @profileImage)
                `);

      console.log("✅ User created successfully");
      return result.recordset[0];
    } catch (err) {
      console.error("Error creating user:", err);
      throw err;
    }
  }

  /**
   * Update a user
   * @param {number} id - User's ID
   * @param {Object} updateData - Fields to update
   * @returns {Promise<Object|null>} Updated user object or null
   */
  static async update(id, updateData) {
    try {
      // Normalize field names
      const updates = {};
      if (updateData.fullName || updateData.FullName || updateData.fullname) {
        updates.FullName =
          updateData.fullName || updateData.FullName || updateData.fullname;
      }
      if (updateData.email || updateData.Email) {
        updates.Email = updateData.email || updateData.Email;
      }
      if (updateData.password || updateData.Password) {
        updates.Password = updateData.password || updateData.Password;
      }
      if (updateData.role || updateData.Role) {
        updates.Role = updateData.role || updateData.Role;
      }
      if (
        updateData.phoneNumber ||
        updateData.PhoneNumber ||
        updateData.phonenumber
      ) {
        updates.PhoneNumber =
          updateData.phoneNumber ||
          updateData.PhoneNumber ||
          updateData.phonenumber;
      }
      if (
        updateData.profileImage ||
        updateData.ProfileImage ||
        updateData.profileimage
      ) {
        updates.ProfileImage =
          updateData.profileImage ||
          updateData.ProfileImage ||
          updateData.profileimage;
      }
      if (updateData.isActive !== undefined) {
        updates.IsActive = updateData.isActive || updateData.IsActive;
      }

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
        // Determine data type based on field
        if (key === "IsActive") {
          request.input(key, sql.Bit, value);
        } else {
          request.input(key, sql.NVarChar, value);
        }
      });

      const query = `
                UPDATE Users 
                SET ${setClause}, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE UserID = @id
            `;

      console.log("🔄 Updating user with:", updates);
      const result = await request.query(query);

      if (result.recordset.length === 0) {
        return null;
      }

      console.log("✅ User updated successfully");
      return result.recordset[0];
    } catch (err) {
      console.error("Error updating user:", err);
      throw err;
    }
  }

  /**
   * Delete a user
   * @param {number} id - User's ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  static async delete(id) {
    try {
      const pool = await sql.connect();
      const result = await pool
        .request()
        .input("id", sql.Int, id)
        .query("DELETE FROM Users WHERE UserID = @id");

      const deleted = result.rowsAffected[0] > 0;
      if (deleted) {
        console.log(`🗑️ User ${id} deleted successfully`);
      } else {
        console.log(`⚠️ User ${id} not found for deletion`);
      }
      return deleted;
    } catch (err) {
      console.error("Error deleting user:", err);
      throw err;
    }
  }

  /**
   * Get all users
   * @returns {Promise<Array>} Array of user objects
   */
  static async findAll() {
    try {
      const pool = await sql.connect();
      const result = await pool.request().query(`
                    SELECT * FROM Users 
                    ORDER BY CreatedAt DESC
                `);
      return result.recordset;
    } catch (err) {
      console.error("Error finding all users:", err);
      throw err;
    }
  }

  /**
   * Get users by role
   * @param {string} role - User role
   * @returns {Promise<Array>} Array of user objects
   */
  static async findByRole(role) {
    try {
      const pool = await sql.connect();
      const result = await pool
        .request()
        .input("role", sql.NVarChar, role)
        .query(
          "SELECT * FROM Users WHERE Role = @role ORDER BY CreatedAt DESC",
        );
      return result.recordset;
    } catch (err) {
      console.error("Error finding users by role:", err);
      throw err;
    }
  }

  /**
   * Get active users
   * @returns {Promise<Array>} Array of active user objects
   */
  static async findActive() {
    try {
      const pool = await sql.connect();
      const result = await pool.request().query(`
                    SELECT * FROM Users 
                    WHERE IsActive = 1 
                    ORDER BY CreatedAt DESC
                `);
      return result.recordset;
    } catch (err) {
      console.error("Error finding active users:", err);
      throw err;
    }
  }

  /**
   * Update last login time
   * @param {number} id - User's ID
   * @returns {Promise<boolean>} True if updated
   */
  static async updateLastLogin(id) {
    try {
      const pool = await sql.connect();
      const result = await pool.request().input("id", sql.Int, id).query(`
                    UPDATE Users 
                    SET LastLogin = GETDATE() 
                    WHERE UserID = @id
                `);
      return result.rowsAffected[0] > 0;
    } catch (err) {
      console.error("Error updating last login:", err);
      throw err;
    }
  }

  /**
   * Search users by name or email
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} Array of matching user objects
   */
  static async search(searchTerm) {
    try {
      const pool = await sql.connect();
      const result = await pool
        .request()
        .input("searchTerm", sql.NVarChar, `%${searchTerm}%`).query(`
                    SELECT * FROM Users 
                    WHERE FullName LIKE @searchTerm 
                       OR Email LIKE @searchTerm
                    ORDER BY CreatedAt DESC
                `);
      return result.recordset;
    } catch (err) {
      console.error("Error searching users:", err);
      throw err;
    }
  }

  /**
   * Count total users
   * @returns {Promise<number>} Total number of users
   */
  static async count() {
    try {
      const pool = await sql.connect();
      const result = await pool
        .request()
        .query("SELECT COUNT(*) as total FROM Users");
      return result.recordset[0].total;
    } catch (err) {
      console.error("Error counting users:", err);
      throw err;
    }
  }

  /**
   * Sanitize user object (remove sensitive data)
   * @param {Object} user - User object
   * @returns {Object} Sanitized user object
   */
  static sanitize(user) {
    if (!user) return null;
    const sanitized = { ...user };
    delete sanitized.Password;
    delete sanitized.password;
    return sanitized;
  }

  /**
   * Sanitize multiple user objects
   * @param {Array} users - Array of user objects
   * @returns {Array} Array of sanitized user objects
   */
  static sanitizeMany(users) {
    if (!users || !Array.isArray(users)) return [];
    return users.map((user) => this.sanitize(user));
  }
}

module.exports = User;
