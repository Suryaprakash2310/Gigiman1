const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const MultipleEmployee = require("../models/multipleEmployee.model");
const SingleEmployee = require("../models/singleEmployee.model");
const ServiceList = require("../models/serviceList.model");
const Booking = require("../models/Booking.model");
const ToolShop = require("../models/toolshop.model");
const EmployeeService = require("../models/employeeService.model");
const PartRequest = require("../models/partsrequest.model");

const BOOKING_STATUS = require("../enum/bookingstatus.enum");
const {
    SEARCH_RADIUS_METERS,
} = require("../utils/constants");

require("dotenv").config();

const mapboxClient = mbxGeocoding({ accessToken: process.env.MAP_BOX_TOKEN });


// ------------------------------------------------------
// 1. GEOCODE ADDRESS
// ------------------------------------------------------
exports.geocodeAddress = async (address) => {
    const res = await mapboxClient
        .forwardGeocode({
            query: address,
            limit: 1,
        })
        .send();

    const feature = res.body.features[0];
    return feature ? feature.geometry.coordinates : null; // [lng, lat]
};



// ------------------------------------------------------
// 2. FIND NEARBY SERVICERS (SINGLE / TEAM)
// ------------------------------------------------------
exports.findNearbyTeams = async ({
    address,
    coordinates,
    serviceCategoryName,
    radiusInMeters = SEARCH_RADIUS_METERS,
}) => {
    const serviceList = await ServiceList.findOne({
        "serviceCategory.serviceCategoryName": serviceCategoryName,
    });

    if (!serviceList) throw new Error("Service Category not found");

    const category = serviceList.serviceCategory.find(
        (c) => c.serviceCategoryName === serviceCategoryName
    );

    if (!category) throw new Error("Service Category not found in list");

    const employeeCount = category.employeeCount;
    const domainServiceId = serviceList.DomainServiceId;

    let lngLat = coordinates;
    if (!lngLat && address) lngLat = await exports.geocodeAddress(address);
    if (!lngLat) throw new Error("Unable to resolve location");

    const [lng, lat] = lngLat;

    // FETCH ALL EMPLOYEES CAPABLE OF THIS DOMAIN SERVICE
    const capableEmployees = await EmployeeService.find({
        capableservice: { $in: [domainServiceId] },
    });

    const capableEmployeeIds = capableEmployees.map((e) => e.employeeId);

    // CASE A — SINGLE EMPLOYEE REQUIRED
    if (employeeCount === 1) {
        const singles = await SingleEmployee.find({
            empId: { $in: capableEmployeeIds },
            teamAccepted: false,
            location: {
                $near: {
                    $geometry: { type: "Point", coordinates: [lng, lat] },
                    $maxDistance: radiusInMeters,
                },
            },
        });

        return {
            type: "single",
            data: singles,
            employeeCount,
            coordinates: [lng, lat],
        };
    }

    // CASE B — TEAM REQUIRED
    const teams = await MultipleEmployee.find({
        members: { $in: capableEmployeeIds },
        $expr: { $gte: [{ $size: "$members" }, employeeCount] },
        location: {
            $near: {
                $geometry: { type: "Point", coordinates: [lng, lat] },
                $maxDistance: radiusInMeters,
            },
        },
    }).populate("leader");

    return {
        type: "team",
        data: teams,
        employeeCount,
        coordinates: [lng, lat],
    };
};



// ----------------------------------------------------------------------
// 3. AUTO ASSIGN QUEUE FOR SINGLE EMPLOYEES
// ----------------------------------------------------------------------
const bookingQueue = {}; 

exports.startServicerQueue = async ({ bookingId, servicers, userSocket, io }) => {
    bookingQueue[bookingId] = {
        servicers,
        index: 0,
        userSocket,
        timer: null,
    };

    exports.assignNextServicer(bookingId, io);
};

exports.assignNextServicer = async (bookingId, io) => {
    const queue = bookingQueue[bookingId];
    if (!queue) return;

    const servicerId = queue.servicers[queue.index];

    // If no more employees
    if (!servicerId) {
        io.to(queue.userSocket).emit("no-servicer-available");
        delete bookingQueue[bookingId];
        return;
    }

    const servicer = await SingleEmployee.findById(servicerId);
    if (servicer?.socketId) {
        io.to(servicer.socketId).emit("new-booking-request", { bookingId });
    }

    // Timeout — move to next employee
    queue.timer = setTimeout(() => {
        queue.index++;
        exports.assignNextServicer(bookingId, io);
    }, 30000);
};

exports.servicerAccept = async (bookingId, employeeId, io) => {
    const queue = bookingQueue[bookingId];
    if (!queue) return;

    clearTimeout(queue.timer);
    delete bookingQueue[bookingId];

    io.to(queue.userSocket).emit("servicer-accepted", { bookingId, employeeId });
};

exports.servicerReject = async (bookingId, io) => {
    const queue = bookingQueue[bookingId];
    if (!queue) return;

    clearTimeout(queue.timer);
    queue.index++;
    exports.assignNextServicer(bookingId, io);
};



// ----------------------------------------------------------------------
// 4. TEAM AUTO ASSIGN (TEAM LEADER RECEIVES REQUEST)
// ----------------------------------------------------------------------
const teamQueue = {}; // { bookingId: { teams, index, userSocket, timer } }

exports.startTeamQueue = async ({ bookingId, teams, userSocket, io }) => {
    teamQueue[bookingId] = {
        teams,
        index: 0,
        userSocket,
        timer: null,
    };

    exports.assignNextTeam(bookingId, io);
};

exports.assignNextTeam = async (bookingId, io) => {
    const queue = teamQueue[bookingId];
    if (!queue) return;

    const teamId = queue.teams[queue.index];

    if (!teamId) {
        io.to(queue.userSocket).emit("no-team-available");
        delete teamQueue[bookingId];
        return;
    }

    const team = await MultipleEmployee.findById(teamId).populate("leader");

    if (team?.leader?.socketId) {
        io.to(team.leader.socketId).emit("team-booking-request", { bookingId });
    }

    queue.timer = setTimeout(() => {
        queue.index++;
        exports.assignNextTeam(bookingId, io);
    }, 30000);
};

exports.teamAccept = async (bookingId, teamId, io) => {
    const queue = teamQueue[bookingId];
    if (!queue) return;

    clearTimeout(queue.timer);
    delete teamQueue[bookingId];

    io.to(queue.userSocket).emit("team-accepted", { bookingId, teamId });
};

exports.teamReject = async (bookingId, io) => {
    const queue = teamQueue[bookingId];
    if (!queue) return;

    clearTimeout(queue.timer);
    queue.index++;
    exports.assignNextTeam(bookingId, io);
};



// ----------------------------------------------------------------------
// 5. CREATE BOOKING (ONLY AFTER ACCEPT)
// ----------------------------------------------------------------------
exports.createBooking = async ({
    userId,
    servicerId,            // teamId or single employee _id
    serviceCategoryName,
    domainService,
    address,
    coordinates,
}) => {

    // 1. Get service category
    const serviceList = await ServiceList.findOne({
        "serviceCategory.serviceCategoryName": serviceCategoryName,
    });
    if (!serviceList) throw new Error("Service category not found");

    const category = serviceList.serviceCategory.find(
        (c) => c.serviceCategoryName === serviceCategoryName
    );
    if (!category) throw new Error("Invalid serviceCategoryName");

    const employeeCount = category.employeeCount;

    // ------------------------------------------------------------
    // CASE A — SINGLE EMPLOYEE SERVICE
    // ------------------------------------------------------------
    if (employeeCount === 1) {
        const single = await SingleEmployee.findById(servicerId);
        if (!single) throw new Error("Single employee not found");

        const booking = await Booking.create({
            user: userId,
            serviceType: "single",
            primaryEmployee: single._id,
            employees: [single._id],
            ServiceCategoryName: serviceCategoryName,
            domainService,
            status: BOOKING_STATUS.PENDING,
            address,
            location: { type: "Point", coordinates },
        });

        return {
            booking,
            assignedEmployees: [single._id],
            primaryEmployee: single._id,
            helpers: [],
            employeeCount,
            serviceType: "single",
        };
    }

    // ------------------------------------------------------------
    // CASE B — TEAM SERVICE (MANUAL ASSIGN — NO AUTO SELECTION)
    // ------------------------------------------------------------
    const team = await MultipleEmployee.findById(servicerId);
    if (!team) throw new Error("Team not found");

    if (team.members.length < employeeCount) {
        throw new Error("Team does not have enough members for this service");
    }

    // DO NOT ASSIGN ANY MEMBER HERE — WAIT FOR SOCKET ASSIGN
    const booking = await Booking.create({
        user: userId,
        servicerCompany: servicerId,     // team _id
        serviceType: "team",
        primaryEmployee: null,           // assigned later
        employees: [],                   // assigned later
        ServiceCategoryName: serviceCategoryName,
        domainService,
        status: BOOKING_STATUS.PENDING,
        address,
        location: { type: "Point", coordinates },
    });

    return {
        booking,
        assignedEmployees: [],
        primaryEmployee: null,
        helpers: [],
        employeeCount,
        serviceType: "team",
    };
};




// ----------------------------------------------------------------------
// 6. START WORK OTP
// ----------------------------------------------------------------------
exports.generateStartOTP = async (bookingId) => {
    const otp = Math.floor(1000 + Math.random() * 9000);

    const booking = await Booking.findByIdAndUpdate(
        bookingId,
        { StartWorkOTP: otp },
        { new: true }
    );

    return { booking, otp };
};

exports.verifyStartOTP = async (bookingId, otp) => {
    const booking = await Booking.findById(bookingId);
    if (!booking) return { success: false };

    if (booking.StartWorkOTP !== Number(otp)) return { success: false };

    booking.StartWorkOTP = null;
    booking.status = BOOKING_STATUS.IN_PROGRESS;
    await booking.save();

    return { success: true, booking };
};


exports.findNearbyToolShops = async ({ coordinates, radiusInMeters = SEARCH_RADIUS_METERS }) => {
    if (!coordinates || coordinates.length !== 2) {
        throw new Error("Invalid coordinates for toolshop search");
    }

    const [lng, lat] = coordinates;

    const shops = await ToolShop.find({
        location: {
            $near: {
                $geometry: { type: "Point", coordinates: [lng, lat] },
                $maxDistance: radiusInMeters,
            },
        },
    });

    return shops;
};

// ----------------------------------------------------------------------
// 7. TOOLSHOP AUTO ASSIGN
// ----------------------------------------------------------------------
const toolshopQueue = {}; // { requestId: { shops, index, employeeSocket, timer } }

exports.startToolShopQueue = ({ requestId, shops, employeeSocket, io }) => {
    toolshopQueue[requestId] = {
        shops,
        index: 0,
        employeeSocket,
        timer: null,
    };

    exports.assignNextToolshop(requestId, io);
};

exports.assignNextToolshop = async (requestId, io) => {
    const queue = toolshopQueue[requestId];
    if (!queue) return;

    const shopId = queue.shops[queue.index];

    if (!shopId) {
        io.to(queue.employeeSocket).emit("no-toolshop-available");
        delete toolshopQueue[requestId];
        return;
    }

    const shop = await ToolShop.findById(shopId);

    if (shop?.socketId) {
        io.to(shop.socketId).emit("toolshop-booking-request", { requestId });
    }

    queue.timer = setTimeout(() => {
        queue.index++;
        exports.assignNextToolshop(requestId, io);
    }, 30000);
};

// ----------------------------------------------------------------------
// 8. TOOL REQUEST (EMPLOYEE → USER)
// ----------------------------------------------------------------------
exports.requestTool = async (bookingId, toolName) => {
    const booking = await Booking.findById(bookingId);

    if (!booking) throw new Error("Booking not found");

    booking.requestedTool = toolName;
    await booking.save();

    return booking;
};


exports.toolshopAccept = async (requestId, shopId, io) => {
    const queue = toolshopQueue[requestId];
    if (!queue) return;

    clearTimeout(queue.timer);
    delete toolshopQueue[requestId];

    const otp = Math.floor(1000 + Math.random() * 9000);

    io.to(queue.employeeSocket).emit("toolshop-accepted", { requestId, shopId, otp });
};

exports.toolshopReject = (requestId, io) => {
    const queue = toolshopQueue[requestId];
    if (!queue) return;

    clearTimeout(queue.timer);
    queue.index++;
    exports.assignNextToolshop(requestId, io);
};


// ----------------------------------------------------------------------
// 10. PART REQUEST FLOW
// ----------------------------------------------------------------------
exports.createPartRequest = async ({ bookingId, employeeId, parts, totalCost }) => {
    const req = await PartRequest.create({
        bookingId,
        employeeId,
        parts,
        totalCost,
        status: "requested",
        approvalByUser: false,
        otp: null
    });

    return req;
};


// ----------------------------------------------------------------------
//   generate OTP
// ----------------------------------------------------------------------
exports.generateToolOTP = async (requestId) => {
    const otp = Math.floor(1000 + Math.random() * 9000);

    const req = await PartRequest.findByIdAndUpdate(
        requestId,
        {
            status: "approved",
            approvalByUser: true,
            otp
        },
        { new: true }
    );

    return { req, otp };
};


// ----------------------------------------------------------------------
// TOOLSHOP accepts part pickup request (optional)
// ----------------------------------------------------------------------
exports.assignPartShop = async (requestId, shopId) => {
    const req = await PartRequest.findByIdAndUpdate(
        requestId,
        { shopId },
        { new: true }
    );

    return req;
};


// ----------------------------------------------------------------------
// Verify OTP → Mark part as collected
// ----------------------------------------------------------------------
exports.verifyPartOTP = async (requestId, otp) => {
    const req = await PartRequest.findById(requestId);

    if (!req) return { success: false, message: "Request not found" };
    if (req.otp !== Number(otp)) return { success: false, message: "Invalid OTP" };

    req.status = "collected";
    req.otp = null;
    await req.save();

    return { success: true, req };
};


