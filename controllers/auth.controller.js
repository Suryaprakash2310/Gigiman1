const User = require("../models/userSchema");
const bcrypt = require("bcrypt");
const errormsg = require("../utilization/404.js");
const Service = require("../models/serviceschema");
const Subservice = require("../models/subServiceSchema.js");
const Booking = require("../models/BookingServiceSchema.js");
const { createToken } = require("../utilization/token.js");

// Register user
const register = async (req, res, next) => {
  try {
    const { storename, email, password, ownername, empnum, GSTnum, storelocation } = req.body;
    if (!storename || !email || !password || !ownername || !empnum || !GSTnum || !storelocation) {
      return next(errormsg(400, "All fields are required"));
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(errormsg(400, "Email is already registered"));
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      storename,
      email,
      password: hashedPassword,
      ownername,
      empnum: empnum.toString(),
      GSTnum: GSTnum.toString(),
      storelocation,
    });

    await newUser.save();
    const token = createToken(newUser._id);
    const { password: _, ...userData } = newUser._doc;

    res.status(201).json({ message: "User registered successfully!", user: userData, token });
  } catch (error) {
    console.error("Registration error:", error);
    return next(errormsg(500, "Server issue"));
  }
};

// Login user
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return next(errormsg(400, "Email and password are required"));
    }

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return next(errormsg(400, "Invalid email or password"));
    }

    const token = createToken(user._id);
    const { password: _, ...userData } = user._doc;
    res.status(200).json({ message: "Login successful", user: userData, token });
  } catch (error) {
    console.error("Login error:", error);
    return next(errormsg(500, "Server error"));
  }
};

// Get all services
const service = async (req, res, next) => {
  try {
    const services = await Service.find().select("servicename serviceimageurl");
    res.json(services);
  } catch (error) {
    console.error("Error fetching services:", error);
    return next(errormsg(500, "Server error"));
  }
};

// Get subservices based on selected service
const subservice = async (req, res, next) => {
  try {
    const { serviceId } = req.query;
    if (!serviceId) {
      return next(errormsg(400, "Missing serviceId"));
    }

    const subservices = await Subservice.find({ serviceId }).select("subservicename subserviceimageurl");
    res.json(subservices);
  } catch (error) {
    console.error("Error fetching subservices:", error);
    return next(errormsg(500, "Server error"));
  }
};

// Create a booking (with JWT auth)
const createBooking = async (req, res, next) => {
  try {
    const userId = req.userId; // Comes from token
    const { servicename, subservicename, amount, duration, description, other } = req.body;

    if (!servicename || !subservicename) {
      return next(errormsg(400, "All fields are required"));
    }

    const service = await Service.findOne({ servicename });
    if (!service) return next(errormsg(404, "Service not found"));

    const subservice = await Subservice.findOne({
      subservicename,
      serviceId: service._id,
    });

    if (!subservice) return next(errormsg(404, "Subservice not found"));

    const newBooking = new Booking({
      userId,
      serviceId: service._id,
      subServiceId: subservice._id,
      amount,
      duration,
      description,
      other,
    });

    await newBooking.save();
    res.status(201).json({ message: "Booking created", booking: newBooking });
  } catch (err) {
    console.error("Booking error:", err);
    return next(errormsg(500, "Server error"));
  }
};

// Get bookings for a user (JWT required)
const getBookings = async (req, res, next) => {
  try {
    const userId = req.userId;

    const bookings = await Booking.find({ userId })
      .populate("serviceId", "servicename")
      .populate("subServiceId", "subservicename")
      .select("amount duration description other serviceId subServiceId");

    const formatted = bookings.map((b) => ({
      serviceName: b.serviceId.servicename,
      subServiceName: b.subServiceId.subservicename,
      amount: b.amount,
      duration: b.duration,
      description: b.description,
      other: b.other,
    }));

    res.json(formatted);
  } catch (error) {
    console.error("Fetch booking error:", error);
    return next(errormsg(500, "Server error"));
  }
};

// Logout (client-side can just delete the token)
const logout = (req, res, next) => {
  try {
    res.status(200).json({ message: "Logged out successfully (client should discard token)" });
  } catch (error) {
    console.error("Error logging out:", error);
    return next(errormsg(500, "Server error"));
  }
};

module.exports = {
  register,
  login,
  logout,
  service,
  subservice,
  createBooking,
  getBookings,
};
