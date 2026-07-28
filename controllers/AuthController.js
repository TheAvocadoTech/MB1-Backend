// controllers/AuthController.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User.model");

/* ===========================
   SIGNUP
=========================== */

const signup = async (req, res) => {
  try {
    // Log incoming request for debugging
    console.log("📥 Signup request body:", req.body);

    // Extract fields from request body (support both camelCase and PascalCase)
    const fullName =
      req.body.fullName || req.body.FullName || req.body.fullname;
    const email = req.body.email || req.body.Email;
    const password = req.body.password || req.body.Password;
    const role = req.body.role || req.body.Role || "Receptionist";

    // Validate required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full Name, Email and Password are required.",
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists.",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user - using the field names that match your model
    const user = await User.create({
      fullName: fullName,
      email: email,
      password: hashedPassword,
      role: role || "Receptionist",
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.UserID || user.Id || user.userId,
        role: user.Role || user.role,
        email: user.Email || user.email,
      },
      process.env.JWT_SECRET || "your-secret-key-here",
      {
        expiresIn: "7d",
      },
    );

    // Remove password from response
    delete user.Password;
    delete user.password;

    res.status(201).json({
      success: true,
      message: "Signup successful.",
      token,
      user,
    });
  } catch (err) {
    console.error("❌ Signup error:", err);
    console.error("Stack:", err.stack);

    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   LOGIN
=========================== */

const login = async (req, res) => {
  try {
    console.log("📥 Login request body:", req.body);

    const email = req.body.email || req.body.Email;
    const password = req.body.password || req.body.Password;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // Find user by email
    const user = await User.findByEmail(email);

    if (!user) {
      console.log(`❌ [AUTH CTRL] Login failed: User "${email}" not found in DB.`);
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(
      password,
      user.Password || user.password,
    );

    if (!isMatch) {
      console.log(`❌ [AUTH CTRL] Login failed: Password mismatch for user "${email}".`);
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.UserID || user.Id || user.userId,
        role: user.Role || user.role,
        email: user.Email || user.email,
      },
      process.env.JWT_SECRET || "your-secret-key-here",
      {
        expiresIn: "7d",
      },
    );

    console.log(`🎉 [AUTH CTRL] Login SUCCESS for "${email}" (Role: ${user.Role}). Token issued.`);

    // Remove password from response
    delete user.Password;
    delete user.password;

    res.json({
      success: true,
      message: "Login successful.",
      token,
      user,
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    console.error("Stack:", err.stack);

    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET PROFILE
=========================== */

const getProfile = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User ID not found in token.",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Remove password from response
    delete user.Password;
    delete user.password;

    res.json({
      success: true,
      user,
    });
  } catch (err) {
    console.error("❌ Get profile error:", err);

    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   UPDATE PROFILE
=========================== */

const updateProfile = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const fullName =
      req.body.fullName || req.body.FullName || req.body.fullname;
    const profileImage =
      req.body.profileImage || req.body.ProfileImage || req.body.profileimage;
    const phoneNumber =
      req.body.phoneNumber || req.body.PhoneNumber || req.body.phonenumber;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User ID not found in token.",
      });
    }

    // Build update data object
    const updateData = {};
    if (fullName) updateData.FullName = fullName;
    if (profileImage) updateData.ProfileImage = profileImage;
    if (phoneNumber) updateData.PhoneNumber = phoneNumber;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update.",
      });
    }

    const user = await User.update(userId, updateData);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Remove password from response
    delete user.Password;
    delete user.password;

    res.json({
      success: true,
      message: "Profile updated successfully.",
      user,
    });
  } catch (err) {
    console.error("❌ Update profile error:", err);

    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   GET ALL USERS
=========================== */

const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll();

    // Remove passwords from all users
    const sanitizedUsers = users.map((user) => {
      delete user.Password;
      delete user.password;
      return user;
    });

    res.json({
      success: true,
      users: sanitizedUsers,
    });
  } catch (err) {
    console.error("❌ Get all users error:", err);

    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   DELETE USER
=========================== */

const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id || req.params.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required.",
      });
    }

    const result = await User.delete(userId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.json({
      success: true,
      message: "User deleted successfully.",
    });
  } catch (err) {
    console.error("❌ Delete user error:", err);

    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ===========================
   LOGOUT
=========================== */

const logout = async (req, res) => {
  res.json({
    success: true,
    message: "Logged out successfully.",
  });
};

/* ===========================
   EXPORTS
=========================== */

module.exports = {
  signup,
  login,
  getProfile,
  updateProfile,
  getAllUsers,
  deleteUser,
  logout,
};
