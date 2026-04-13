module.exports = (req, res, next) => {
  const start = Date.now();
  const originalSend = res.send.bind(res);

  res.send = function (body) {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | Time: ${duration}ms`);
    return originalSend(body);
  };

  next();
};
