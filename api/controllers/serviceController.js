// controllers/serviceController.js
const Service = require("../models/Service");
const ServiceDetails = require("../models/servicedetail_model");


// ✅ Create new service
exports.createService = async (req, res) => {
  try {
    const { service_name, department_name, service_url } = req.body;

    const newService = await Service.create({
      service_name,
      department_name,
      service_url,
    });

    return res.status(201).json(newService);
  } catch (error) {
    console.error("Error creating service:", error);
    return res.status(500).json({ error: "Failed to create service" });
  }
};

// ✅ Get all services
exports.getServices = async (req, res) => {
  try {
    const services = await Service.findAll();
    return res.json(services);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch services" });
  }
};

// ✅ Get service by ID
exports.getServiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findByPk(id);

    if (!service) return res.status(404).json({ error: "Service not found" });

    return res.json(service);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch service" });
  }
};

// ✅ Update service
exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { service_name, department_name, service_url, status } = req.body;

    const service = await Service.findByPk(id);
    if (!service) return res.status(404).json({ error: "Service not found" });

    service.service_name = service_name || service.service_name;
    service.department_name = department_name || service.department_name;
    service.service_url = service_url || service.service_url;
    service.status = status ?? service.status;
    service.updated_at = new Date();

    await service.save();

    return res.json(service);
  } catch (error) {
    return res.status(500).json({ error: "Failed to update service" });
  }
};

// ✅ Delete service (soft delete)
exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findByPk(id);

    if (!service) return res.status(404).json({ error: "Service not found" });

    await service.destroy();

    return res.json({ message: "Service deleted successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete service" });
  }
};
