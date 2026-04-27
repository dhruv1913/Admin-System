const { errorResponse } = require("../utils/responseHandler");

module.exports = (err, req, res, next) => {
  console.error(" Global Error:", err.stack);
  const message =
    process.env.NODE_ENV === "development"
      ? err.message
      : "Internal Server Error";
  errorResponse(res, message, 500);
};
