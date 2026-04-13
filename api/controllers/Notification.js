// controllers/noticeController.js
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Notice = require("../models/Notification");

/**
 * Get all notices
 */
exports.getNotices = async (req, res) => {
  try {
    const notices = await Notice.findAll({
      where: { is_deleted: false },
      order: [["created_on", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      message: "Notices retrieved successfully",
      data: notices,
    });
  } catch (error) {
    console.error("Error fetching notices:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notices",
      error: error.message,
    });
  }
};

/**
 * Get a single notice by ID
 */
exports.getNoticeById = async (req, res) => {
  try {
    const { id } = req.params;

    const notice = await Notice.findOne({
      where: { id, is_deleted: false },
    });

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: "Notice not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notice retrieved successfully",
      data: notice,
    });
  } catch (error) {
    console.error("Error fetching notice by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notice",
      error: error.message,
    });
  }
};


/**
 * Create a new Notice
 */
exports.createNotice = async (req, res) => {
  try {
    const { msg_en,msg_hi, start_on, end_on, status } = req.body;
    console.log(req.body);

    const notice = await Notice.create({
      msg_en,
      msg_hi,
      start_on: start_on  || null,
      end_on: end_on || null,
      status: status ?? true, // use nullish coalescing instead of ||
      is_deleted: false,
      //created_on: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "Notice created successfully",
      data: notice,
    });
  } catch (error) {
    console.error("Error creating notice:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create notice",
      error: error.message,
    });
  }
};

/**
 * Update an existing Notice
 */
exports.updateNotice = async (req, res) => {
  try {
    const { id } = req.params;
    const { msg_en,msg_hi, start_on, end_on, status } = req.body;

    const notice = await Notice.findByPk(id);
    if (!notice || notice.is_deleted) {
      return res.status(404).json({ success: false, message: "Notice not found" });
    }

    await notice.update({
      msg_en,
      msg_hi,
      start_on: start_on || notice.start_on,
      end_on: end_on || notice.end_on,
      status: status ?? notice.status,
    });

    return res.status(200).json({
      success: true,
      message: "Notice updated successfully",
      data: notice,
    });
  } catch (error) {
    console.error("Error updating notice:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update notice",
      error: error.message,
    });
  }
};

/**
 * Delete Notice(s) - soft delete (single or multiple)
 */
exports.deleteNotice = async (req, res) => {
  try {
    let ids = req.params.id || req.body.ids; // single id in params or multiple in body
    if (!ids) {
      return res.status(400).json({ success: false, message: "No IDs provided" });
    }

    if (typeof ids === "string") {
      ids = ids.split(",").map((id) => parseInt(id.trim(), 10)).filter(Boolean);
    }

    const [updatedCount] = await Notice.update(
      { is_deleted: true },
      { where: { id: ids } }
    );

    return res.json({
      success: true,
      message: `${updatedCount} notice(s) marked as deleted`,
    });
  } catch (error) {
    console.error("Error deleting notices:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete notices",
      error: error.message,
    });
  }
};
