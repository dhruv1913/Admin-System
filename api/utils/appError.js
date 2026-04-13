/**
 * Custom Application Error Class
 * Used to throw operational errors in your application
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);

    this.statusCode = statusCode; // HTTP status code
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error"; // "fail" for client errors, "error" for server
    this.isOperational = true; // distinguishes expected errors from programming bugs

    Error.captureStackTrace(this, this.constructor); // preserves stack trace
  }
}

module.exports = AppError;
