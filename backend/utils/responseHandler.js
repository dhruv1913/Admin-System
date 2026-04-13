exports.successResponse = (res, data, message = "Success", statusCode = 200) => {
    // Send data directly so React can read response.data.token perfectly
    return res.status(statusCode).json(data);
};

exports.errorResponse = (res, message = "Error occurred", statusCode = 500) => {
    // Keep this format so React can read err.response.data.message
    return res.status(statusCode).json({ message });
};