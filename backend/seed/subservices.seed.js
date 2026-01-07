const mongoose = require("mongoose");
const ServiceList = require("../models/serviceList.model");
const DomainService = require("../models/domainservice.model");

const MONGO_URI = "mongodb://localhost:27017/gigiman"; // change if needed

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    const domain = await DomainService.findOne({
      domainName: "Electrical Work",
    });

    if (!domain) {
      throw new Error("DomainService not found");
    }

    await ServiceList.deleteMany({ DomainServiceId: domain._id });

    await ServiceList.insertMany([
      {
        DomainServiceId: domain._id,
        serviceName: "Fan Installation",
        serviceCategory: [
          {
            serviceCategoryName: "Ceiling Fan Installation",
            description: "Install ceiling fan safely",
            price: 149,
            durationInMinutes: 30,
            employeeCount: 1,
          },
          {
            serviceCategoryName: "Wall Fan Installation",
            description: "Wall-mounted fan installation",
            price: 199,
            durationInMinutes: 40,
            employeeCount: 1,
          },
        ],
      },
      {
        DomainServiceId: domain._id,
        serviceName: "Switch Repair",
        serviceCategory: [
          {
            serviceCategoryName: "Switch Replacement",
            description: "Replace damaged switches",
            price: 99,
            durationInMinutes: 20,
            employeeCount: 1,
          },
          {
            serviceCategoryName: "Switch Board Repair",
            description: "Fix loose or burnt switch boards",
            price: 149,
            durationInMinutes: 30,
            employeeCount: 1,
          },
        ],
      },
      {
        DomainServiceId: domain._id,
        serviceName: "Inverter Service",
        serviceCategory: [
          {
            serviceCategoryName: "Inverter General Service",
            description: "Routine inverter maintenance",
            price: 299,
            durationInMinutes: 60,
            employeeCount: 1,
          },
          {
            serviceCategoryName: "Battery Replacement",
            description: "Replace inverter battery",
            price: 499,
            durationInMinutes: 45,
            employeeCount: 1,
          },
        ],
      },
    ]);

    console.log("✅ Service data seeded successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding error:", err.message);
    process.exit(1);
  }
}

seed();
