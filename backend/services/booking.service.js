const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const MultipleEmployee = require("../models/multipleEmployee.model");
const SingleEmployee = require("../models/singleEmployee.model");
const ServiceList = require("../models/serviceList.model");
const Booking = require("../models/Booking.model");
const ToolShop = require("../models/toolshop.model");
const EmployeeService = require("../models/employeeService.model");
const PartRequest = require("../models/partsrequest.model");
const User = require("../models/user.model");
const BOOKING_STATUS = require("../enum/bookingstatus.enum");
const { SEARCH_RADIUS_METERS } = require("../utils/constants");
const mongoose = require("mongoose");
const PART_REQUEST_STATUS = require("../enum/partsstatus.enum");
const AppError = require("../utils/AppError");
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

    if (!serviceList) {
        throw new AppError("Service Category not found", 404);
    }


    const category = serviceList.serviceCategory.find(
        c => c.serviceCategoryName === serviceCategoryName
    );

    if (!category) throw new AppError("Invalid service category", 400);

    const employeeCount = category.employeeCount;
    const domainServiceId = serviceList.DomainServiceId;

    let lngLat = coordinates;
    if (!lngLat && address) lngLat = await exports.geocodeAddress(address);
    if (!lngLat) throw new AppError("Unable to resolve location", 400);

    const [lng, lat] = lngLat;

    // Employees capable of this domain
    const capableEmployees = await EmployeeService.find({
        capableservice: domainServiceId,
    });

    const capableEmployeeIds = capableEmployees.map(e => e.employeeId);
    const capableEmployeeObjectIds = capableEmployeeIds.map(
        id => new mongoose.Types.ObjectId(id)
    );

    /* ======================================================
       SINGLE EMPLOYEE
    ====================================================== */
    if (serviceCount < 2 && employeeCount === 1) {
        const singles = await SingleEmployee.aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [lng, lat] },
                    key: "location",
                    distanceField: "distance",
                    maxDistance: radiusInMeters,
                    spherical: true,
                    query: {
                        _id: { $in: capableEmployeeObjectIds },
                        isActive: true,
                        availabilityStatus: "AVAILABLE",
                        $or: [
                            { blockedUntil: null },
                            { blockedUntil: { $lte: new Date() } }
                        ]
                    }
                }
            }
        ]);

        return {
            type: "single",
            data: singles,
            employeeCount: 1,
            coordinates: [lng, lat],
        };
    }

    /* ======================================================
       TEAM ONLY
    ====================================================== */
    const teams = await MultipleEmployee.aggregate([
        {
            $geoNear: {
                near: { type: "Point", coordinates: [lng, lat] },
                key: "location",
                distanceField: "distance",
                spherical: true,
                query: {
                    isActive: true,
                    teamStatus: "AVAILABLE",
                    $or: [
                        { blockedUntil: null },
                        { blockedUntil: { $lte: new Date() } }
                    ],
                    members: { $in: capableEmployeeObjectIds }
                }
            }
        },
        {
            $match: {
                $expr: {
                    $gte: [{ $size: "$members" }, employeeCount]
                }
            }
        },
        {
            $sort: { distance: 1 }
        },
        {
            $lookup: {
                from: "singleemployees",
                localField: "leader",
                foreignField: "_id",
                as: "leader"
            }
        },
        {
            $unwind: {
                path: "$leader",
                preserveNullAndEmptyArrays: true
            }
        }
    ]);
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


exports.assignNextServicer = async ({ bookingId, coordinates, io }) => {
    const [lng, lat] = coordinates;


    //  Pick + lock ONE provider atomically
    const servicer = await SingleEmployee.findOneAndUpdate(
        {
            isActive: true,
            availabilityStatus: "AVAILABLE",
            $or: [
                { blockedUntil: null },
                { blockedUntil: { $lte: new Date() } }
            ],
            location: {
                $near: {
                    $geometry: { type: "Point", coordinates: [lng, lat] },
                    $maxDistance: SEARCH_RADIUS_METERS,
                },
            },
        },
        {
            $set: {
                availabilityStatus: "OFFERED",
                offerBookingId: bookingId,
            },
        },
        { new: true }
    );
    //  No provider
    if (!servicer) {
        const booking = await Booking.findById(bookingId).populate("user");
        if (booking?.user?.socketId) {
            io.to(booking.user.socketId).emit("no-servicer-available");
        }
        return;

    }

    //  Emit immediately (FAST)
    if (servicer.socketId) {
        io.to(servicer.socketId).emit(
            "new-booking-request",
            { bookingId },
        );
    }

    //  Single timeout (retry, NOT loop)
    setTimeout(async () => {
        const stillOffered = await SingleEmployee.findOne({
            _id: servicer._id,
            offerBookingId: bookingId,
            availabilityStatus: "OFFERED",
        });

        if (!stillOffered) return;

        await SingleEmployee.findByIdAndUpdate(servicer._id, {
            availabilityStatus: "AVAILABLE",
            offerBookingId: null,
        });

        exports.assignNextServicer({ bookingId, coordinates, io });
    }, 150000); //  2.5 minutes
};


exports.servicerAccept = async (bookingId, employeeId, io) => {
    //  Assign employee to booking
    const booking = await Booking.findOneAndUpdate(
        {
            _id: bookingId,
            primaryEmployee: null,
            status: BOOKING_STATUS.PENDING,
        },
        {
            $set: {
                primaryEmployee: employeeId,
                employees: [employeeId],
            },
        },
        { new: true }
    );

    if (!booking) return;

    //  GENERATE OTP IMMEDIATELY AFTER ACCEPT
    const { booking: updatedBooking, otp } =
        await this.generateStartOTP(booking._id);

    //  Notify USER with booking + OTP
    const user = await User.findById(updatedBooking.user).select("socketId");

    console.log(" OTP generated for booking:", otp);

    if (user?.socketId) {
        io.to(user.socketId).emit("servicer-accepted", {
            booking: updatedBooking,
            otp,
        });
    }

    //  Notify PROVIDER booking confirmed
    const employee = await SingleEmployee.findById(employeeId);
    if (employee?.socketId) {
        io.to(employee.socketId).emit("booking-confirmed", { booking: updatedBooking, otp });
    }
};


exports.servicerReject = async ({ bookingId, employeeId, coordinates, io }) => {
    const employee = await SingleEmployee.findOne({
        _id: employeeId,
        offerBookingId: bookingId,
        availabilityStatus: "OFFERED",
    });

    if (!employee) return;
    await SingleEmployee.findByIdAndUpdate(employeeId, {
        availabilityStatus: "AVAILABLE",
        offerBookingId: null,
    });

    const booking = await Booking.findById(bookingId);
    if (!booking) return;

    // Retry assignment (fast, loop-free)
    exports.assignNextServicer({
        bookingId,
        coordinates: booking.location.coordinates,
        io,
    });
};

/* ======================================================
   4. TEAM AUTO ASSIGN
====================================================== */
exports.assignNextTeam = async ({ bookingId, coordinates, employeeCount, io }) => {
    const [lng, lat] = coordinates;

    //  Pick + lock ONE TEAM atomically
    const team = await MultipleEmployee.findOneAndUpdate(
        {
            isActive: true,
            teamStatus: "AVAILABLE",
            $or: [
                { blockedUntil: null },
                { blockedUntil: { $lte: new Date() } },
            ],
            $expr: { $gte: [{ $size: "$members" }, employeeCount] },
            location: {
                $near: {
                    $geometry: { type: "Point", coordinates: [lng, lat] },
                    $maxDistance: SEARCH_RADIUS_METERS,
                },
            },
        },
        {
            $set: {
                teamStatus: "OFFERED",
                offerBookingId: bookingId,
            },
        },
        { new: true }
    );

    //  No team available
    if (!team) {
        const booking = await Booking.findById(bookingId).populate("user");
        if (booking?.user?.socketId) {
            io.to(booking.user.socketId).emit("no-team-available");
        }
        return;
    }

    //  Emit immediately to team leader
    if (team.socketId) {
        const booking = await Booking.findById(bookingId);
        io.to(team.socketId).emit("team-booking-request", {
            bookingId,
            teamId: team._id,
            employeeCount,
            serviceCategory: booking.serviceCategoryName
        });
    }

    //  Single timeout (retry)
    setTimeout(async () => {
        const stillOffered = await MultipleEmployee.findOne({
            _id: team._id,
            offerBookingId: bookingId,
            teamStatus: "OFFERED",
        });

        if (!stillOffered) return;

        await MultipleEmployee.findByIdAndUpdate(team._id, {
            teamStatus: "AVAILABLE",
            offerBookingId: null,
        });

        exports.assignNextTeam({
            bookingId,
            coordinates,
            employeeCount,
            io,
        });
    }, 150000); // 2.5 min
};


exports.teamAccept = async ({
    bookingId,
    teamId,
    leaderEmpId,
    helperEmpIds = [],
    io
}) => {
    try {
        if (!bookingId || !teamId || !leaderEmpId) {
            return {
                success: false,
                reason: "bookingId, teamId and leaderEmpId are required"
            };
        }

        /*  Fetch team */
        const team = await MultipleEmployee.findOne(
            {
                _id: teamId,
                offerBookingId: bookingId,
                teamStatus: "OFFERED"
            },
            { members: 1, leader: 1, helpers: 1 }
        );

        if (!team) {
            throw new AppError("Team not found or not offered for this booking", 400);
        }

        /*  Fetch leader */
        const leader = await SingleEmployee.findById(leaderEmpId);

        if (!leader) {
            throw new AppError("Leader not found", 404);
        }

        const memberIdSet = new Set(
            team.members.map(m => m.toString())
        );

        /*  Validate leader is a team member */
        if (!memberIdSet.has(leader._id.toString())) {
            if (!leader) {
                throw new AppError("Leader not found", 404);
            }
        }

        // Fetch booking EARLY (read-only)
        const bookingMeta = await Booking.findById(bookingId)
            .select("employeeCount status serviceType user");

        if (!bookingMeta) {
            throw new AppError("Booking not found", 404);
        }

        if (bookingMeta.status !== BOOKING_STATUS.PENDING) {
            throw new AppError("Booking not pending", 409);
        }

        /*  Fetch helpers */
        let helperDocs = [];
        if (helperEmpIds.length) {
            helperDocs = await SingleEmployee.find({
                _id: { $in: helperEmpIds }
            });

            if (helperDocs.length + 1 !== bookingMeta.employeeCount) {
                throw new AppError(`Requires ${bookingMeta.employeeCount} employees`, 422);
            }

            /*  Validate helpers using SET (FAST) */
            const invalidHelper = helperDocs.find(
                h => !memberIdSet.has(h._id.toString())
            );

            if (invalidHelper) {
                throw new AppError(`Helper ${invalidHelper.empId} is not a team member`, 422);
            }
        }

        /*  Assign roles to team */
        team.leader = leader._id;
        team.helpers = helperDocs.map(h => h._id);

        await team.save();

        const booking = await Booking.findOneAndUpdate(
            {
                _id: bookingId,
                servicerCompany: null,
                status: BOOKING_STATUS.PENDING
            },
            {
                servicerCompany: teamId,
                serviceType: "team",
                primaryEmployee: leader._id,
                employees: [leader._id, ...helperDocs.map(h => h._id)],
                status: BOOKING_STATUS.ASSIGNED //  REQUIRED
            },
            { new: true }
        );

        if (!booking) {
            throw new AppError("Booking already assigned", 409);
        }

        /*  Generate OTP */
        const otp = Math.floor(1000 + Math.random() * 9000);
        booking.StartWorkOTP = otp;
        await booking.save();

        console.log(" OTP generated for team booking:", otp);

        /*  Mark team BUSY */
        const teamUpdate = await MultipleEmployee.findByIdAndUpdate(teamId, {
            teamStatus: "BUSY",
            offerBookingId: null
        }, { new: true });

        /* Notify USER */
        const user = await User.findById(booking.user).select("socketId");
        if (user?.socketId) {
            io.to(user.socketId).emit("otp-generated", {
                bookingId: booking._id,
                otp
            });
        }

        /*  Notify LEADER */
        const leaderSocket = await SingleEmployee.findById(leader._id).select("socketId");
        if (leaderSocket?.socketId) {
            io.to(leaderSocket.socketId).emit("leader-otp-ready", {
                bookingId: booking._id
            });
        }
        return {
            success: true,
            bookingId: booking._id
        };

    } catch (err) {
        console.error("teamAcceptAndAssign error:", err && err.stack ? err.stack : err);
        throw err;
    }

};


exports.teamReject = async ({ bookingId, teamId, io }) => {

    const team = await MultipleEmployee.findOne({
        _id: teamId,
        offerBookingId: bookingId,
        teamStatus: "OFFERED",
    });

    if (!team) return;

    await MultipleEmployee.findByIdAndUpdate(teamId, {
        teamStatus: "AVAILABLE",
        offerBookingId: null,
    });

    const booking = await Booking.findById(bookingId);
    if (!booking) return;

    exports.assignNextTeam({
        bookingId,
        coordinates: booking.location.coordinates,
        employeeCount: booking.employeeCount,
        io,
    });
};


/* ======================================================
   5. CREATE BOOKING
====================================================== */
exports.createBooking = async ({
    userId,
    serviceCategoryName,
    domainService,
    address,
    coordinates,
    serviceCount = 1,
}) => {

    /* -------------------------
       Validate serviceCount
    ------------------------- */
    if (!Number.isInteger(serviceCount) || serviceCount < 1) {
        throw new AppError("Invalid service count", 400);
    }

    /* -------------------------
       Fetch service category
    ------------------------- */
    const serviceList = await ServiceList.findOne({
        "serviceCategory.serviceCategoryName": serviceCategoryName,
    });
    if (!serviceList) {
        throw new AppError("Service category not found", 404);
    }

    const category = serviceList.serviceCategory.find(
        c => c.serviceCategoryName === serviceCategoryName
    );
    if (!category) {
        throw new AppError("Invalid service category", 400);
    }
    const employeeCount = category.employeeCount;
    const pricePerService = category.price;
    const totalPrice = pricePerService * serviceCount;
    if (
        !Array.isArray(coordinates) ||
        coordinates.length !== 2 ||
        typeof coordinates[0] !== "number" ||
        typeof coordinates[1] !== "number"
    ) {
        throw new AppError("Invalid or missing coordinates", 400);
    }
    /* ======================================================
       SINGLE SERVICE (NO EMPLOYEE YET)
    ====================================================== */
    if (serviceCount < 2 && employeeCount === 1) {
        const booking = await Booking.create({
            user: userId,
            serviceType: "single",
            primaryEmployee: null,     //  assigned after accept
            employees: [],
            serviceCategoryName,
            domainService,
            serviceCount,
            pricePerService,
            totalPrice,
            employeeCount: 1,
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
       TEAM SERVICE
    ====================================================== */
    const booking = await Booking.create({
        user: userId,
        serviceType: "team",
        servicerCompany: null,
        primaryEmployee: null,
        employees: [],
        serviceCategoryName,
        domainService,
        serviceCount,
        pricePerService,
        totalPrice,
        employeeCount,
        status: BOOKING_STATUS.PENDING,
        address,
        location: { type: "Point", coordinates },
        StartWorkOTP: null,
    });

    return {
        booking,
        serviceType: "team",
        employeeCount,
    };
};

exports.verifyStartOTP = async (bookingId, otp) => {
    const booking = await Booking.findById(bookingId);

    if (!booking) {
        throw new AppError("Booking not found", 404);
    }

    // OTP must exist
    if (!booking.StartWorkOTP) {
        throw new AppError("OTP not generated or already used", 409);
    }

    // Status must be correct
    if (booking.status !== BOOKING_STATUS.PENDING) {
        throw new AppError("Invalid booking state", 409);
    }

    // OTP validation
    if (booking.StartWorkOTP !== Number(otp)) {
        throw new AppError("Invalid OTP", 401);
    }

    // OTP verified → start work
    booking.StartWorkOTP = null;
    booking.status = BOOKING_STATUS.IN_PROGRESS;
    await booking.save();

    return booking;
};


/* ======================================================
   7. TOOLSHOP FLOW
====================================================== */
exports.assignNextToolshop = async ({ requestId, coordinates, io }) => {
    const [lng, lat] = coordinates;

    //  Pick + lock ONE toolshop atomically
    const shop = await ToolShop.findOneAndUpdate(
        {
            isActive: true,
            activeRequests: { $lt: "$maxCapacity" },
            $or: [
                { blockedUntil: null },
                { blockedUntil: { $lte: new Date() } },
            ],
            location: {
                $near: {
                    $geometry: { type: "Point", coordinates: [lng, lat] },
                    $maxDistance: SEARCH_RADIUS_METERS,
                },
            },
        },
        {
            $inc: { activeRequests: 1 },
            $push: { activeRequestIds: requestId }
        },
        { new: true }
    );


    //  No shop available
    if (!shop) {
        const request = await PartRequest.findById(requestId).populate("employeeId");
        if (request?.employeeId?.socketId) {
            io
                .to(request.employeeId.socketId)
                .emit("no-toolshop-available", { requestId });
        }
        return;
    }

    //  Emit immediately
    if (shop.socketId) {
        io.to(shop.socketId).emit("toolshop-booking-request", {
            requestId,
        });

    }
    //  Single timeout (retry)
    setTimeout(async () => {
        const stillOffered = await ToolShop.findOne({
            _id: shop._id,
            offerRequestId: requestId,
        });

        if (!stillOffered) return;

        await ToolShop.findByIdAndUpdate(shop._id, {
            offerRequestId: null,
        });

        exports.assignNextToolshop({ requestId, coordinates, io });
    }, 15000);
};


exports.toolshopAccept = async ({ requestId, shopId, io }) => {
    const shop = await ToolShop.findOne({
        _id: shopId,
        offerRequestId: requestId,
    });

    if (!shop) {
        return;
    }

    const otp = Math.floor(1000 + Math.random() * 9000);

    const request = await PartRequest.findOneAndUpdate(
        {
            _id: requestId,
            approvalByUser: true,
        },
        {
            $set: {
                shopId,
                selectedToolShop: shopId,
                status: PART_REQUEST_STATUS.READY_FOR_PICKUP,
                otp,
            },
        },
        { new: true }
    );

    if (!request) {
        await ToolShop.findByIdAndUpdate(shopId, {
            offerRequestId: null,
        });
        return;
    }

    //  Mark shop BUSY
    await ToolShop.findByIdAndUpdate(shopId, {
        $inc: { activeRequests: 1 },
        $set: { offerRequestId: null }
    });

    console.log(" OTP generated:", otp);

    //  Get employee socket
    const employee = await SingleEmployee
        .findById(request.employeeId)
        .select("socketId");

    if (!employee?.socketId) {
        return;
    }

    //  Emit pickup details
    io.to(employee.socketId).emit("toolshop-accepted", {
        requestId: request._id,
        otp,
        shop: {
            name: shop.shopName,
            address: shop.storeLocation,
            phone: shop.phoneMasked,
        },
        parts: request.parts,
        totalCost: request.totalCost,
    });
};



exports.toolshopReject = async ({ requestId, shopId, io }) => {

    const shop = await ToolShop.findOne({
        _id: shopId,
        offerRequestId: requestId,
    });

    if (!shop) return;

    await ToolShop.findByIdAndUpdate(shopId, {
        $inc: { activeRequests: -1 },
        offerRequestId: null,
    });

    const request = await PartRequest.findById(requestId);
    if (!request) return;

    exports.assignNextToolshop({
        requestId,
        coordinates: request.location.coordinates,
        io,
    });
};


/* ======================================================
   8. PART REQUEST
====================================================== */
exports.requestTool = async ({ bookingId, employeeId, parts, totalCost, io }) => {

    //  Validate booking
    const booking = await Booking.findOne({
        _id: bookingId,
        primaryEmployee: employeeId,
        status: BOOKING_STATUS.IN_PROGRESS,
    });

    if (!booking) {
        throw new AppError("Invalid booking or employee not assigned", 404);
    }

    //  Prevent duplicate active requests (ENUM SAFE)
    const existing = await PartRequest.findOne({
        bookingId,
        status: {
            $in: [
                PART_REQUEST_STATUS.REQUESTED,
                PART_REQUEST_STATUS.APPROVED_BY_USER,
                PART_REQUEST_STATUS.WAITING_TOOLSHOP,
            ],
        },
    });

    if (existing) {
        throw new AppError("Active part request already exists", 422);
    }

    //  Create part request
    const partRequest = await PartRequest.create({
        bookingId,
        employeeId,
        parts,
        totalCost,
        status: PART_REQUEST_STATUS.REQUESTED,
        approvalByUser: false,
        otp: null,
    });

    //  Emit to USER (best-effort)
    if (io && booking.user) {
        io.to(booking.user.toString()).emit("tool-request-created", {
            requestId: partRequest._id,
            parts,
            totalCost,
        }, );
    }

    return partRequest;
};


exports.verifyPartOTP = async (requestId, otp, io) => {
    //  Validate request
    const req = await PartRequest.findOne({
        _id: requestId,
        status: PART_REQUEST_STATUS.READY_FOR_PICKUP,
        otp: Number(otp),
    });

    if (!req) {
        return new AppError("Invalid request or OTP", 404);
    }

    //  Mark as collected
    req.status = PART_REQUEST_STATUS.COLLECTED;
    req.otp = null;
    await req.save();
    const employee = await SingleEmployee.findById(req.employeeId).select("socketId");
    if (io && employee?.socketId) {
        try {
            io.to(employee.socketId).emit("tool-otp-verified", {
                requestId,
                otp,
            });
        } catch (e) {
            console.error('emit tool-otp-verified failed', e);
        }
    }
    return {
        success: true,
        req,
    };
};