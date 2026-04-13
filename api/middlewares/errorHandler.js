const AppError = require("../utils/appError");

module.exports = (err, req, res, next) => {
  console.error("🔥 Global Error Handler:", err);

  // Use statusCode if AppError, else 500
  const statusCode = err.statusCode || 500;
  const status = err.status || "error";
  const message = err.message || "Internal Server Error";

  const response = {
    success: false,
    message,
    status,
  };

  // Show stack trace only in development
  if (process.env.NODE_ENV === "development") {
    response.error = {
      message: err.message,
      stack: err.stack,
    };
  }

  res.status(statusCode).json(response);
};
