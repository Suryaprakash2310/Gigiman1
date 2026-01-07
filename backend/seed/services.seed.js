const mongoose = require('mongoose');
const DomainService = require('../models/domainservice.model'); // adjust path if needed

const services = [
  { domainName: "Electrical Work", serviceImage: "https://cdn-icons-png.flaticon.com/128/2965/2965567.png" },
  { domainName: "Plumbing", serviceImage: "https://cdn-icons-png.flaticon.com/128/1046/1046874.png" },
  { domainName: "Carpentry", serviceImage: "https://cdn-icons-png.flaticon.com/128/3081/3081968.png" },
  { domainName: "Home Cleaning", serviceImage: "https://cdn-icons-png.flaticon.com/128/609/609803.png" },
  { domainName: "AC Repair", serviceImage: "https://cdn-icons-png.flaticon.com/128/1684/1684375.png" },
  { domainName: "Painting", serviceImage: "https://cdn-icons-png.flaticon.com/128/2974/2974121.png" },
  { domainName: "Gardening", serviceImage: "https://cdn-icons-png.flaticon.com/128/1749/1749274.png" },
  { domainName: "Appliance Installation", serviceImage: "https://cdn-icons-png.flaticon.com/128/4727/4727259.png" },
  { domainName: "Pest Control", serviceImage: "https://cdn-icons-png.flaticon.com/128/2766/2766745.png" },
];

async function seed() {
  try {
    await mongoose.connect('mongodb://localhost:27017/gigiman');
    await DomainService.deleteMany({});
    await DomainService.insertMany(services);
    console.log("✅ Services added successfully!");
    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    mongoose.connection.close();
  }
}

seed();
