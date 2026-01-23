const mongoose = require("mongoose");
require("dotenv").config();

const Domainparts = require("./models/domainparts.model");

const MONGO_URI =
  process.env.MONGO_URL || "mongodb://127.0.0.1:27017/gigiman";

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    const domainPartsData = [
      { partName: "Copper Wiring", categoryName: "Electrical", price: 120 },
      { partName: "Ceiling Fan Capacitor", categoryName: "Electrical", price: 180 },
      { partName: "MCB Switch", categoryName: "Electrical", price: 250 },
      { partName: "AC Compressor", categoryName: "AC Parts", price: 8500 },
      { partName: "AC Gas R32", categoryName: "AC Parts", price: 3200 },
      { partName: "AC Copper Pipe (1 meter)", categoryName: "AC Parts", price: 650 },
      { partName: "Water Tap", categoryName: "Plumbing", price: 350 },
      { partName: "PVC Pipe (1 meter)", categoryName: "Plumbing", price: 120 },
      { partName: "Flush Valve", categoryName: "Plumbing", price: 900 }
    ];

    await Domainparts.deleteMany();
    await Domainparts.insertMany(domainPartsData);

    console.log("Domain parts seeded successfully");
    await mongoose.connection.close();
  } catch (err) {
    console.error("Seeding failed:", err.message);
    process.exit(1);
  }
}

seed();
