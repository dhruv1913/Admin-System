module.exports = (req, res, next) => {
  res.success = (message, data = {}, statusCode = 200) =>
    res.status(statusCode).json({
      success: true,
      message,
      ...(Object.keys(data).length ? { data } : {}),
    });

  res.error = (message, statusCode = 500, error = null) => {
    const response = { success: false, message };
    if (error) response.error = error;
    return res.status(statusCode).json(response);
  };

  next();
};
