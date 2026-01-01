const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const MultipleEmployee = require("../models/multipleEmployee.model");
const SingleEmployee = require("../models/singleEmployee.model");
const ServiceList = require("../models/serviceList.model");
const Booking = require("../models/Booking.model");
const ToolShop = require("../models/toolshop.model");
const EmployeeService = require("../models/employeeService.model");
const PartRequest = require("../models/partsrequest.model");

const BOOKING_STATUS = require("../enum/bookingstatus.enum");
const { SEARCH_RADIUS_METERS } = require("../utils/constants");

require("dotenv").config();

const MAP_BOX_TOKEN = process.env.MAP_BOX_TOKEN;
const mapboxClient = mbxGeocoding({ accessToken: MAP_BOX_TOKEN });

/* ======================================================
   1. GEOCODE ADDRESS
====================================================== */
exports.geocodeAddress = async (address) => {
    const res = await mapboxClient.forwardGeocode({
        query: address,
        limit: 1,
    }).send();

    const feature = res.body.features?.[0];
    return feature ? feature.geometry.coordinates : null;
};

/* ======================================================
   2. FIND NEARBY SERVICERS
====================================================== */
exports.findNearbyTeams = async ({
    address,
    coordinates,
    serviceCategoryName,
    serviceCount = 1,
    radiusInMeters = SEARCH_RADIUS_METERS,
}) => {
    const serviceList = await ServiceList.findOne({
        "serviceCategory.serviceCategoryName": serviceCategoryName,
    });

    if (!serviceList) throw new Error("Service Category not found");

    const category = serviceList.serviceCategory.find(
        c => c.serviceCategoryName === serviceCategoryName
    );

    if (!category) throw new Error("Invalid service category");

    const employeeCount = category.employeeCount;
    const domainServiceId = serviceList.DomainServiceId;

    let lngLat = coordinates;
    if (!lngLat && address) lngLat = await exports.geocodeAddress(address);
    if (!lngLat) throw new Error("Unable to resolve location");

    const [lng, lat] = lngLat;

    // employees capable of this domain
    const capableEmployees = await EmployeeService.find({
        capableservice: { $in: [domainServiceId] },
    });

    const capableEmployeeIds = capableEmployees.map(e => e.employeeId);

    /* ======================================================
       SINGLE EMPLOYEE — STRICT CONDITION
       serviceCount < 2 AND employeeCount === 1
    ====================================================== */
    if (serviceCount < 2 && employeeCount === 1) {
        const singles = await SingleEmployee.find({
            empId: { $in: capableEmployeeIds },
            isActive: true,
            teamAccepted: false,
            $or: [
                { blockedUntil: null },
                { blockedUntil: { $lte: new Date() } },
            ],
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
            employeeCount: 1,
            coordinates: [lng, lat],
        };
    }

    /* ======================================================
       TEAM ONLY (NO SINGLE SEARCH)
    ====================================================== */
    const teams = await MultipleEmployee.find({
        members: { $in: capableEmployeeIds },
        $expr: { $gte: [{ $size: "$members" }, employeeCount] },
        isActive: true,
        $or: [
            { blockedUntil: null },
            { blockedUntil: { $lte: new Date() } },
        ],
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


/* ======================================================
   3. SINGLE EMPLOYEE AUTO ASSIGN QUEUE
====================================================== */
const bookingQueue = {};

exports.startServicerQueue = async ({ bookingId, servicers, userSocket, io }) => {
    bookingQueue[bookingId] = { servicers, index: 0, userSocket, timer: null };
    exports.assignNextServicer(bookingId, io);
};

exports.assignNextServicer = async (bookingId, io) => {
    const queue = bookingQueue[bookingId];
    if (!queue) return;

    const servicerId = queue.servicers[queue.index];
    if (!servicerId) {
        io.to(queue.userSocket).emit("no-servicer-available");
        delete bookingQueue[bookingId];
        return;
    }

    const servicer = await SingleEmployee.findById(servicerId);
    if (!servicer || !servicer.isActive ||
        (servicer.blockedUntil && servicer.blockedUntil > new Date())) {
        queue.index++;
        return exports.assignNextServicer(bookingId, io);
    }

    if (servicer.socketId) {
        io.to(servicer.socketId).emit("new-booking-request", { bookingId });
    }

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

/* ======================================================
   4. TEAM AUTO ASSIGN
====================================================== */
const teamQueue = {};

exports.startTeamQueue = async ({ bookingId, teams, userSocket, io }) => {
    teamQueue[bookingId] = { teams, index: 0, userSocket, timer: null };
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
    if (!team || !team.isActive ||
        (team.blockedUntil && team.blockedUntil > new Date())) {
        queue.index++;
        return exports.assignNextTeam(bookingId, io);
    }

    if (team.leader?.socketId) {
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

/* ======================================================
   5. CREATE BOOKING
====================================================== */
exports.createBooking = async ({
    userId,
    servicerId,
    serviceCategoryName,
    domainService,
    address,
    coordinates,
    serviceCount = 1,
}) => {

    // -------------------------
    // Validate serviceCount
    // -------------------------
    if (!Number.isInteger(serviceCount) || serviceCount < 1) {
        throw new Error("Invalid service count");
    }

    // -------------------------
    // Fetch service category
    // -------------------------
    const serviceList = await ServiceList.findOne({
        "serviceCategory.serviceCategoryName": serviceCategoryName,
    });
    if (!serviceList) throw new Error("Service category not found");

    const category = serviceList.serviceCategory.find(
        c => c.serviceCategoryName === serviceCategoryName
    );
    if (!category) throw new Error("Invalid service category");

    const employeeCount = category.employeeCount;
    const pricePerService = category.price;
    const totalPrice = pricePerService * serviceCount;

    /* ======================================================
       SINGLE EMPLOYEE — STRICT RULE
       serviceCount < 2 AND employeeCount === 1
    ====================================================== */
    if (serviceCount < 2 && employeeCount === 1) {

        const single = await SingleEmployee.findOne({
            _id: servicerId,
            isActive: true,
            $or: [
                { blockedUntil: null },
                { blockedUntil: { $lte: new Date() } },
            ],
        });

        if (!single) {
            throw new Error("Single employee unavailable");
        }

        const booking = await Booking.create({
            user: userId,
            serviceType: "single",
            primaryEmployee: single._id,
            employees: [single._id],
            serviceCategoryName,
            domainService,
            serviceCount,
            pricePerService,
            totalPrice,
            status: BOOKING_STATUS.PENDING,
            address,
            location: { type: "Point", coordinates },
            StartWorkOTP: null,
        });

        return {
            booking,
            serviceType: "single",
            employeeCount: 1,
        };
    }

    /* ======================================================
       TEAM ONLY — NO SINGLE FALLBACK
    ====================================================== */
    const booking = await Booking.create({
        user: userId,
        servicerCompany: servicerId || null, // team/company id
        serviceType: "team",
        primaryEmployee: null,               // assigned after accept
        employees: [],                       // filled after assignment
        serviceCategoryName,
        domainService,
        serviceCount,
        pricePerService,
        totalPrice,
        status: BOOKING_STATUS.PENDING,      // OTP not verified yet
        address,
        location: { type: "Point", coordinates },
        StartWorkOTP: null,
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

exports.teamAcceptBooking = async ({ bookingId, teamId }) => {
    const booking = await Booking.findById(bookingId);
    if (!booking) throw new Error("Booking not found");

    const team = await MultipleEmployee.findById(teamId).populate("members leader");
    if (!team) throw new Error("Team not found");

    // select employees (example logic)
    const primaryEmployee = team.leader._id;
    const helpers = team.members
        .filter(m => m._id.toString() !== primaryEmployee.toString())
        .slice(0, booking.employeeCount - 1);

    const assignedEmployees = [primaryEmployee, ...helpers.map(h => h._id)];

    booking.primaryEmployee = primaryEmployee;
    booking.employees = assignedEmployees;

    await booking.save();

    return {
        booking,
        assignedEmployees,
        primaryEmployee,
        helpers,
        serviceType: "team",
    };
};


/* ======================================================
   6. START WORK OTP
====================================================== */
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
    if (!booking || booking.StartWorkOTP !== Number(otp)) {
        return { success: false };
    }

    booking.StartWorkOTP = null;
    booking.status = BOOKING_STATUS.IN_PROGRESS;
    await booking.save();

    return { success: true, booking };
};

/* ======================================================
   7. TOOLSHOP FLOW
====================================================== */
const toolshopQueue = {};

exports.startToolShopQueue = ({ requestId, shops, employeeSocket, io }) => {
    toolshopQueue[requestId] = { shops, index: 0, employeeSocket, timer: null };
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

exports.toolshopAccept = async (requestId, shopId, io) => {
    const queue = toolshopQueue[requestId];
    if (!queue) return;

    clearTimeout(queue.timer);
    delete toolshopQueue[requestId];

    io.to(queue.employeeSocket).emit("toolshop-accepted", { requestId, shopId });
};

exports.toolshopReject = async (requestId, io) => {
    const queue = toolshopQueue[requestId];
    if (!queue) return;

    clearTimeout(queue.timer);
    queue.index++;
    exports.assignNextToolshop(requestId, io);
};

/* ======================================================
   8. PART REQUEST
====================================================== */
exports.createPartRequest = async ({ bookingId, employeeId, parts, totalCost }) => {
    return PartRequest.create({
        bookingId,
        employeeId,
        parts,
        totalCost,
        status: "requested",
        approvalByUser: false,
        otp: null
    });
};

exports.verifyPartOTP = async (requestId, otp) => {
    const req = await PartRequest.findById(requestId);
    if (!req || req.otp !== Number(otp)) {
        return { success: false };
    }

    req.status = "collected";
    req.otp = null;
    await req.save();

    return { success: true, req };
};
