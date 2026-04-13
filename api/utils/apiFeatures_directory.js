const Sequelize = require("sequelize");
const Op = Sequelize.Op;
class APIFeatures {
  constructor(queryString) {
    this.query = "";
    this.queryString = queryString;
  }

  // filter() {
  //   const queryObj = { ...this.queryString };
  //   const excludedFields = [
  //     "page",
  //     "limit",
  //     "sort",
  //     "fields",
  //     "models",
  //     "modelFilter",
  //   ];
  //   excludedFields.forEach((el) => delete queryObj[el]);
  //   //console.log(queryObj);

  //   // 1B) Advanced filtering
  //   //let queryStr = JSON.stringify(queryObj);
  //   //queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `[Op.${match}]`);
  //   this.query = { where: queryObj };

  //   return this;
  // }

  filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = [
      "page",
      "limit",
      "sort",
      "fields",
      "models",
      "modelFilter",
    ];
    excludedFields.forEach((el) => delete queryObj[el]);
  
    const where = {};
  //console.log(key);
    for (const key in queryObj) {
      const value = queryObj[key];
  
      // Check for ilike pattern: field=ilike:value
      if (typeof value === "string" && value.startsWith("ilike:")) {
        where[key] = {
          [Op.iLike]: `${value.slice(6)}%`,
        };
      }
      // Support for gt, gte, lt, lte (e.g. price[gte]=100)
      else if (typeof value === "object") {
        const opMap = {
          gt: Op.gt,
          gte: Op.gte,
          lt: Op.lt,
          lte: Op.lte,
        };
        for (const subKey in value) {
          if (!where[key]) where[key] = {};
          const op = opMap[subKey];
          if (op) {
            where[key][op] = value[subKey];
          }
        }
      } else {
        where[key] = value;
      }
    }
  
    this.query = { ...this.query, where };
  
    return this;
  }
  

  sort() {
    if (this.queryString.sort) {
      const queryObj = [];
      this.queryString.sort
        .split(",")
        .forEach((el) => queryObj.push([el.split(" ")]));
      //console.log(queryObj);
      this.query = { ...this.query, order: queryObj };
    } else {
      this.query = { ...this.query, order: [["id", "DESC"]] };
    }
    return this;
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(",");
      //console.log(fields);
      this.query = { ...this.query, attributes: fields };
    }
    return this;
  }

  join() {
    if (this.queryString.models) {
      const queryObj = [];

      const modelFilterObj = JSON.parse(this.queryString.modelFilter);
      this.queryString.models.split(",").forEach((el) => {
        const attributes = el.split(".");
        const modelElement = attributes.shift();

        queryObj.push({
          association: modelElement,
          attributes: attributes,
          where: modelFilterObj[`${modelElement}`],
        });
      });
      console.log(queryObj);
      //console.log(JSON.parse(this.queryString.modelFilter).User);
      this.query = { ...this.query, include: queryObj };
    }
    return this;
  }

  paginate() {
    const page = this.queryString.page * 1 || 1;
    const limit = this.queryString.limit * 1 || 50;
    const offset = (page - 1) * limit;

    this.query = { ...this.query, offset, limit };
    //console.log(this.query);
    return this;
  }

  order(defaultSortField = 'id', defaultSortOrder = 'ASC') {
    const sortBy = this.queryString.sort || defaultSortField;
    const sortOrder = this.queryString.order
      ? this.queryString.order.toUpperCase()
      : defaultSortOrder.toUpperCase();
  
    this.query = {
      ...this.query,
      order: [[sortBy, sortOrder]],
    };
  
    return this;
  }


}
module.exports = APIFeatures;
