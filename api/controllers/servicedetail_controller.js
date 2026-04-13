const ServiceDetails = require("../models/servicedetail_model");
const Service = require("../models/Service");

const getServiceDetails = async (req, res) => {
  try {
    const { serviceKey } = req.params;
    
    // Sequelize relation-based query
    const serviceDetails = await ServiceDetails.findOne({
      include: [
        {
          model: Service,
          where: { service_key: serviceKey },
          attributes: []
        }
      ],
      attributes: [
        'en_dept_display_name',
        'en_dept_title',
        'hn_dept_display_name',
        'hn_dept_title',
        'logo_path'
      ]
    });

    if (serviceDetails) {
      // Ensure we only return the target parameters without the nested 'Service' object wrapper
      const responseData = {
        en_dept_display_name: serviceDetails.en_dept_display_name,
        en_dept_title: serviceDetails.en_dept_title,
        hn_dept_display_name: serviceDetails.hn_dept_display_name,
        hn_dept_title: serviceDetails.hn_dept_title,
        logo_path: serviceDetails.logo_path
      };
      
      return res.json({ status: "success", data: responseData });
    }

    return res.status(404).json({ status: "error", message: "Service details not found" });
  } catch (error) {
    console.error("Error fetching service details:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
};

const getServiceData = async (req, res) => {
  const service = req.service;
  const user = req.user;

  res.json({
    status: "success",
    tokenValid: true, // token is valid if middleware passed
    message: `Access granted to service ${service.service_name}`,
    //   user,
    //  service,
    timestamp: new Date(),
  });
};

module.exports = {
  getServiceDetails,
  getServiceData
};
