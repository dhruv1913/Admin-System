// services/service.service.js
const Service = require("../models/Service");

async function getServiceByKey(service_key) {
  return await Service.findOne({
    where: { service_key, is_active: true },
  });
}

module.exports = { getServiceByKey };
