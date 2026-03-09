const bcrypt = require("bcryptjs");
const Admin = require("./models/admin.model");
const ROLES = require("./enum/role.enum");
require("dotenv").config();
require("./config/db")();   // connect to MongoDB

(async () => {
  try {
    await Admin.create({
      fullname: "Surya",
      email: "surya@gmail.com",
      password: "Surya@2026",
      role: ROLES.SUPER_ADMIN,
    });

    console.log("Admin created successfully");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();