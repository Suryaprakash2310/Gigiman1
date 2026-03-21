const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const MultipleEmployee = require("../models/multipleEmployee.model");
const SingleEmployee = require("../models/singleEmployee.model");
const ServiceList = require("../models/serviceList.model");
const Booking = require("../models/Booking.model");
const ToolShop = require("../models/toolshop.model");
const EmployeeService = require("../models/employeeService.model");
const PartRequest = require("../models/partsrequest.model");
const User = require("../models/user.model");
const Coupon = require("../models/coupon.model");
const BOOKING_STATUS = require("../enum/bookingstatus.enum");
const { SEARCH_RADIUS_METERS, RADIUS_STEPS, MAX_DISPATCH_ATTEMPTS } = require("../utils/constants");
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
                        isBlocked: { $ne: true },
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
                    isBlocked: { $ne: true },
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
    const booking = await Booking.findById(bookingId).populate('user', "fullName").populate("domainService", "_id");
    const capableEmployees = await EmployeeService.find({
        capableservice: booking.domainService
    });
    const capableEmployeeIds = capableEmployees.map(e => e.employeeId);
    const capableEmployeeObjectIds = capableEmployeeIds.map(
        id => new mongoose.Types.ObjectId(id)
    );

    if (!booking)
        throw new AppError("Booking not found", 404);

    if (booking.status !== BOOKING_STATUS.PENDING || booking.primaryEmployee) {
        console.log(`[Assign] Booking ${bookingId} is already ${booking.status} or assigned. Skipping.`);
        return;
    }

    const rejectdIds = booking?.rejectedEmployees || [];
    const payload = {
        bookingId: booking._id,
        service: booking.serviceCategoryName,
        totalPrice: booking.totalPrice,
        address: booking.address,
        user: {
            name: booking.user?.fullName,
        },
        employeeCount: booking.employeeCount,
        createdAt: booking.createdAt
    };
    if (booking.dispatchAttempts >= 5) {
        await Booking.findByIdAndUpdate(bookingId, {
            assignmentStatus: "FAILED",
        })
        const booking = await Booking.findById(bookingId).populate("user");
        if (booking?.user?.socketId)
            io.to(booking?.user?.socketId).emit("no-servicer-available");
    }
    // Ensure we don't exceed array
    const attemptIndex = Math.min(
        booking.dispatchAttempts,
        RADIUS_STEPS.length - 1
    );
    const dynamicRadius = RADIUS_STEPS[attemptIndex] * 1000;
    console.log(dynamicRadius);

    //  Pick + lock ONE provider atomically
    const servicer = await SingleEmployee.findOneAndUpdate(
        {
            _id: {
                $nin: rejectdIds,
                $in: capableEmployeeObjectIds
            },
            location: {
                $near: {
                    $geometry: { type: "Point", coordinates: [lng, lat] },
                    $maxDistance: dynamicRadius,
                },
            },
            isActive: true,
            availabilityStatus: "AVAILABLE",
            isBlocked: { $ne: true },
            $or: [
                { blockedUntil: null },
                { blockedUntil: { $lte: new Date() } }
            ],
        },
        {
            $set: {
                availabilityStatus: "OFFERED",
                offerBookingId: bookingId,
            },
        },
        { new: true }
    );

    //  Update booking state
    if (servicer) {
        await Booking.findByIdAndUpdate(bookingId, {
            assignmentStatus: "OFFERED",
            offeredEmployee: servicer._id
        });
    }

    console.log("serviceR", servicer);


    //  No provider
    if (!servicer) {
        // Increase dispatchAttempts
        await Booking.findByIdAndUpdate(bookingId, {
            $inc: { dispatchAttempts: 1 }
        });

        // Fetch updated booking
        const updatedBooking = await Booking.findById(bookingId);

        // If still attempts left → retry with next radius
        if (updatedBooking.dispatchAttempts < MAX_DISPATCH_ATTEMPTS) {
            return exports.assignNextServicer({ bookingId, coordinates, io });
        }

        await Booking.findByIdAndUpdate(bookingId, {
            assignmentStatus: "FAILED"
        });

        const user = await User.findById(updatedBooking.user).select("socketId");
        if (user?.socketId) {
            io.to(user.socketId).emit("no-servicer-available");
        }

        return;
    }
    //  Emit immediately (FAST)
    if (servicer.socketId) {
        io.to(`employee_${servicer._id}`).emit(
            "new-booking-request",
            payload
        );
    }

    //  Single timeout (retry, NOT loop)
    setTimeout(async () => {
        const stillOffered = await SingleEmployee.findOne({
            _id: servicer._id,
            offerBookingId: bookingId,
            availabilityStatus: "OFFERED",
        });
        if (!stillOffered) {
            return;
        }

        await Booking.findByIdAndUpdate(bookingId, {
            $addToSet: { rejectedEmployees: servicer._id }
        });

        await SingleEmployee.findByIdAndUpdate(servicer._id, {
            availabilityStatus: "AVAILABLE",
            offerBookingId: null,
        });

        exports.assignNextServicer({ bookingId, coordinates, io });
    }, 50000);
    //  2.5 minutes
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
                status: BOOKING_STATUS.ASSIGNED,
                assignmentStatus: "ASSIGNED",
            },
        },
        { new: true }
    );

    if (!booking) return;

    //  Update Employee to BUSY
    await SingleEmployee.findByIdAndUpdate(employeeId, {
        availabilityStatus: "BUSY",
        offerBookingId: null
    });

    //  GENERATE OTP IMMEDIATELY AFTER ACCEPT
    const { booking: updatedBooking, otp } =
        await this.generateStartOTP(booking._id);

    // Populate for clean frontend use
    await updatedBooking.populate("primaryEmployee", "fullname rating phoneno");

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
        io.to(`employee_${employee._id}`).emit("booking-confirmed", { booking: updatedBooking, otp });
    }
};


exports.servicerReject = async ({ bookingId, employeeId, io }) => {
    const employee = await SingleEmployee.findOne({
        _id: employeeId,
        offerBookingId: bookingId,
        availabilityStatus: "OFFERED",
    });
    const booking = await Booking.findByIdAndUpdate(bookingId, {
        $addToSet: { rejectedEmployees: employeeId }
    })
    if (!booking) throw new AppError("booking not found", 404);

    if (!employee) throw new AppError("employee not found", 404);
    await SingleEmployee.findByIdAndUpdate(employeeId, {
        availabilityStatus: "AVAILABLE",
        offerBookingId: null,
    });

    // Retry assignment 
    exports.assignNextServicer({
        bookingId,
        coordinates: booking.location.coordinates,
        io,
    });
};


exports.convertVisitToService = async ({
    bookingId,
    price,
    durationInMinutes,
    employeeCount,
    io
}) => {
    const booking = await Booking.findById(bookingId).populate("user");
    if (!booking || booking.bookingMode !== "VISIT") return;

    booking.bookingMode = "CATEGORY";
    booking.serviceCategoryName = "Converted Service";
    booking.totalPrice = price;
    booking.durationInMinutes = durationInMinutes;
    booking.employeeCount = employeeCount;

    await booking.save();

    io.to(booking.user.socketId).emit("service-proposed", {
        bookingId,
        price,
        durationInMinutes,
        employeeCount
    });
};

/* ======================================================
   4. TEAM AUTO ASSIGN
====================================================== */
exports.assignNextTeam = async ({ bookingId, coordinates, employeeCount, io }) => {
    const [lng, lat] = coordinates;

    const booking = await Booking.findById(bookingId).select("rejectedMultipleEmployee dispatchAttempts serviceCategoryName address user location");

    if (!booking) return;

    if (booking.dispatchAttempts >= MAX_DISPATCH_ATTEMPTS) {
        await Booking.findByIdAndUpdate(bookingId, {
            assignmentStatus: "FAILED",
        });
        const user = await User.findById(booking.user).select("socketId");
        if (user?.socketId)
            io.to(user.socketId).emit("no-team-available");
        return;
    }

    const rejectedIds = booking.rejectedMultipleEmployee || [];

    // Ensure we don't exceed array
    const attemptIndex = Math.min(
        booking.dispatchAttempts,
        RADIUS_STEPS.length - 1
    );
    const dynamicRadius = RADIUS_STEPS[attemptIndex] * 1000;

    //  Pick + lock ONE TEAM atomically
    const team = await MultipleEmployee.findOneAndUpdate(
        {
            _id: { $nin: rejectedIds },
            location: {
                $near: {
                    $geometry: { type: "Point", coordinates: [lng, lat] },
                    $maxDistance: dynamicRadius,
                },
            },
            isActive: true,
            teamStatus: "AVAILABLE",
            isBlocked: { $ne: true },
            $or: [
                { blockedUntil: null },
                { blockedUntil: { $lte: new Date() } },
            ],
            $expr: { $gte: [{ $size: "$members" }, employeeCount] },
        },
        {
            $set: {
                teamStatus: "OFFERED",
                offerBookingId: bookingId,
            },
        },
        { new: true }
    );

    if (booking.dispatchAttempts >= 5) {
        await Booking.findByIdAndUpdate(bookingId, {
            assignmentStatus: "FAILED",
        })
        booking = await Booking.findById(bookingId).populate("user");
        if (booking?.user?.socketId)
            io.to(`user_${booking.user._id}`).emit("no-servicer-available");
    }

    //  No team available
    if (!team) {
        await Booking.findByIdAndUpdate(bookingId, {
            $inc: { dispatchAttempts: 1 }
        });
        const updatedBooking = await Booking.findById(bookingId);
        if (updatedBooking.dispatchAttempts < MAX_DISPATCH_ATTEMPTS) {
            return exports.assignNextTeam({
                bookingId,
                coordinates,
                employeeCount,
                io,
            });
        }

        await Booking.findByIdAndUpdate(bookingId, {
            assignmentStatus: "FAILED"
        });

        const user = await User.findById(updatedBooking.user).select("socketId");
        if (user?.socketId) {
            io.to(`user_${updatedBooking.user._id}`).emit("no-team-available");
        }
        return;
    }
    console.log("Team found:", team?._id);

    //  Emit immediately to team leader

    //const booking = await Booking.findById(bookingId);
    console.log("Emitting team booking to room:", `team_${team._id}`);
    io.to(`team_${team._id}`).emit("team-booking-request", {
        bookingId,
        teamId: team._id,
        employeeCount,
        serviceCategory: booking.serviceCategoryName,
        address: booking.address,
    });



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
        await Booking.findByIdAndUpdate(bookingId, {
            $addToSet: { rejectedMultipleEmployee: team._id }
        })

        exports.assignNextTeam({
            bookingId,
            coordinates,
            employeeCount,
            io,
        });
    }, 50000); // 2.5 min
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

    const booking = await Booking.findByIdAndUpdate(bookingId,
        {
            $addToSet: { rejectedMultipleEmployee: teamId }
        }
    );
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
    addressTitle,
    coordinates,
    serviceCount = 1,
    couponCode,
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
    const durationInMinutes = category.durationInMinutes;
    const totalServicePrice = pricePerService * serviceCount;
    let totalPrice = totalServicePrice;

    /* -------------------------
       Validate and Calculate Coupon Discount
    ------------------------- */
    let appliedCouponId = null;
    let discountAmount = 0;

    if (couponCode) {
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
        if (!coupon || !coupon.isActive) {
            throw new AppError('Invalid or inactive coupon code', 400);
        }

        const now = new Date();
        if (now < coupon.validFrom || now > coupon.validUntil) {
            throw new AppError('Coupon is expired or not yet valid', 400);
        }

        if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
            throw new AppError('Coupon usage limit reached', 400);
        }

        if (totalServicePrice < coupon.minOrderValue) {
            throw new AppError(`Minimum order value of ${coupon.minOrderValue} required for this coupon`, 400);
        }

        if (coupon.discountType === 'PERCENTAGE') {
            discountAmount = (totalServicePrice * coupon.discountValue) / 100;
            if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
                discountAmount = coupon.maxDiscount;
            }
        } else {
            discountAmount = coupon.discountValue;
        }

        if (discountAmount > totalServicePrice) {
            discountAmount = totalServicePrice;
        }

        totalPrice -= discountAmount;
        appliedCouponId = coupon._id;

        // Increment used count
        coupon.usedCount += 1;
        await coupon.save();
    }

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
            totalServicePrice,
            durationInMinutes,
            totalPrice,
            employeeCount: 1,
            status: BOOKING_STATUS.PENDING,
            address,
            addressTitle,
            location: { type: "Point", coordinates },
            StartWorkOTP: null,
            appliedCoupon: appliedCouponId,
            discountAmount: discountAmount
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
        totalServicePrice,
        durationInMinutes,
        employeeCount,
        status: BOOKING_STATUS.PENDING,
        address,
        addressTitle,
        location: { type: "Point", coordinates },
        StartWorkOTP: null,
        appliedCoupon: appliedCouponId,
        discountAmount: discountAmount
    });

    return {
        booking,
        serviceType: "team",
        employeeCount,
    };
};
exports.generateStartOTP = async (bookingId) => {
    const booking = await Booking.findById(bookingId);

    if (!booking) {
        throw new Error("Booking not found");
    }

    //  Employee must be assigned first
    if (!booking.primaryEmployee) {
        throw new Error("Cannot generate OTP before employee assignment");
    }

    // OTP only allowed before work starts
    if (booking.status !== BOOKING_STATUS.ASSIGNED) {
        throw new Error("OTP can only be generated before work starts");
    }

    const otp = Math.floor(1000 + Math.random() * 9000);

    booking.StartWorkOTP = otp;
    await booking.save();
    console.log("Stored OTP:", booking.StartWorkOTP);
    console.log("Received OTP:", otp);


    return { booking, otp };
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
    if (booking.status !== BOOKING_STATUS.ASSIGNED) {
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

    return { success: true, booking };
};


/* ======================================================
   7. TOOLSHOP FLOW
====================================================== */
exports.assignNextToolshop = async ({ requestId, coordinates, io }) => {
    const [lng, lat] = coordinates;

    const request = await PartRequest.findById(requestId);
    if (!request) return;

    const booking = await Booking.findById(request.bookingId)
        .select("rejectedToolShop toolshopDispatchAttempts");

    if (!booking) return;

    const rejectedIds = booking.rejectedToolShop || [];
    const attempts = booking.toolshopDispatchAttempts || 0;
    const TOOLSHOP_RADIUS_STEPS = [5, 10, 15, 20];
    const MAX_TOOLSHOP_ATTEMPTS = TOOLSHOP_RADIUS_STEPS.length;

    //  STOP if already failed
    if (attempts >= MAX_TOOLSHOP_ATTEMPTS) {
        const request = await PartRequest.findById(requestId)
            .populate("employeeId");

        if (request?.employeeId?.socketId) {
            io.to(request.employeeId.socketId)
                .emit("no-toolshop-available", { requestId });
        }

        return;
    }

    //  Dynamic Radius
    const radiusIndex = Math.min(attempts, TOOLSHOP_RADIUS_STEPS.length - 1);
    const dynamicRadius = TOOLSHOP_RADIUS_STEPS[radiusIndex] * 1000;

    console.log("Toolshop attempt:", attempts);
    console.log("Using radius:", dynamicRadius);

    const shop = await ToolShop.findOneAndUpdate(
        {
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [lng, lat],
                    },
                    $maxDistance: dynamicRadius,
                },
            },
            _id: { $nin: rejectedIds },
            isActive: true,
            $or: [
                { blockedUntil: null },
                { blockedUntil: { $lte: new Date() } },
            ],
            $expr: { $lt: ["$activeRequests", "$maxCapacity"] },
        },
        { $set: { offerRequestId: requestId } },
        { new: true }
    );

    console.log("Selected shop:", shop);
    if (!shop) {
        await Booking.findByIdAndUpdate(booking._id, {
            $inc: { toolshopDispatchAttempts: 1 }
        });

        return exports.assignNextToolshop({ requestId, coordinates, io });
    }

    //  Emit immediately
    if (shop.socketId) {
        io.to(shop.socketId).emit("toolshop-booking-request", {
            requestId,
        });
    }

    //  Timeout logic
    setTimeout(async () => {
        const stillOffered = await ToolShop.findOne({
            _id: shop._id,
            offerRequestId: requestId,
        });

        if (!stillOffered) return;

        await ToolShop.findByIdAndUpdate(shop._id, {
            offerRequestId: null,
        });

        await Booking.findByIdAndUpdate(booking._id, {
            $addToSet: { rejectedToolShop: shop._id },
            $inc: { toolshopDispatchAttempts: 1 }
        });

        exports.assignNextToolshop({ requestId, coordinates, io });

    }, 30000);
};


exports.toolshopAccept = async ({ requestId, shopId, io }) => {
    const shop = await ToolShop.findOne({
        _id: shopId,
        offerRequestId: requestId,
    });
    console.log(shop);
    if (!shop) {
        return;
    }

    const otp = Math.floor(1000 + Math.random() * 9000);
    console.log(otp);
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

    // Update Booking with rejected shop
    const booking = await Booking.findByIdAndUpdate(request.bookingId, {
        $addToSet: { rejectedToolShop: shopId },
        // $inc: { dispatchAttempts: 1 } // optional if you want to track attempts
    }, { new: true });

    if (!booking) return;

    exports.assignNextToolshop({
        requestId,
        coordinates: booking.location.coordinates,
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
        // primaryEmployee: employeeId,
        // status: BOOKING_STATUS.IN_PROGRESS,
    });
    console.log("[[[Booking for part request:", booking);

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

    // if (existing) {
    //     throw new AppError("Active part request already exists", 422);
    // }

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
            bookingId,
            requestId: partRequest._id,
            parts,
            totalCost,
        },);
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
    const booking = await Booking.findByIdAndUpdate(
        req.bookingId,
        {
            $inc: { totalPrice: req.totalCost }
        }, {
        new: true
    }
    )
    await booking.save();
    const shop = await ToolShop.findOne({
        _id: req.shopId,
        offerRequestId: requestId,
    });
    if (!shop) return;

    await ToolShop.findByIdAndUpdate(req.shopId, {
        $inc: { activeRequests: -1 },
        offerRequestId: null,
    });
    await shop.save();
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
    console.log("complete");
    return {
        success: true,
        req,
    };
};

exports.resetAvailability = async (booking) => {
    // SINGLE EMPLOYEE
    if (booking.primaryEmployee) {
        await SingleEmployee.findByIdAndUpdate(
            booking.primaryEmployee,
            {
                availabilityStatus: "AVAILABLE",
                offerBookingId: null
            }
        );
    }

    // TEAM
    if (booking.servicerCompany) {
        await MultipleEmployee.findByIdAndUpdate(
            booking.servicerCompany,
            {
                teamStatus: "AVAILABLE",
                offerBookingId: null
            }
        );
    }
};


exports.proposeVisitServiceSocket = async (
    { bookingId, employeeId, serviceCategoryId },
    socket,
    io
) => {
    try {
        const booking = await Booking.findOne({
            _id: bookingId,
            visitMode: true,
            primaryEmployee: employeeId,
            proposalStatus: { $in: ["NONE", "REJECTED"] }
        });

        if (!booking) return;

        const service = await ServiceList.findOne({
            "serviceCategory._id": serviceCategoryId
        }).lean();

        if (!service) return;

        const category = service.serviceCategory.find(
            c => c._id.toString() === serviceCategoryId
        );

        const proposal = {
            serviceCategoryId,
            serviceCategoryName: category.serviceCategoryName,
            price: category.price,
            durationInMinutes: category.durationInMinutes,
            employeeCount: category.employeeCount,
            proposedAt: new Date()
        };

        booking.proposedService = proposal;
        booking.proposalStatus = "PROPOSED";

        booking.proposalHistory.push({
            serviceCategoryName: category.serviceCategoryName,
            price: category.price,
            proposedBy: employeeId,
            status: "PROPOSED",
            proposedAt: new Date()
        });

        await booking.save();

        // Notify USER
        io.to(booking.user.toString()).emit("service-proposed", {
            bookingId,
            proposal
        });

    } catch (err) {
        console.error("proposeVisitServiceSocket:", err.message);
    }
};


exports.approveVisitServiceSocket = async (
    { bookingId, userId, approve },
    socket,
    io
) => {
    try {
        const booking = await Booking.findOne({
            _id: bookingId,
            user: userId,
            proposalStatus: "PROPOSED"
        });

        if (!booking) return;

        const employee = await SingleEmployee.findById(
            booking.primaryEmployee
        ).select("socketId");

        // ---------------- REJECT ----------------
        if (!approve) {
            booking.proposalStatus = "REJECTED";

            booking.proposalHistory.push({
                serviceCategoryName: booking.proposedService.serviceCategoryName,
                price: booking.proposedService.price,
                proposedBy: booking.primaryEmployee,
                status: "REJECTED",
                proposedAt: new Date()
            });

            await booking.save();

            if (employee?.socketId) {
                io.to(employee.socketId).emit("service-rejected", { bookingId });
            }

            return;
        }

        // ---------------- APPROVE ----------------
        const p = booking.proposedService;

        booking.serviceCategoryName = p.serviceCategoryName;
        booking.pricePerService = p.price;
        booking.totalPrice = p.price;
        booking.durationInMinutes = p.durationInMinutes;
        booking.employeeCount = p.employeeCount;

        booking.visitMode = false;
        booking.proposalStatus = "APPROVED";
        booking.status = "ASSIGNED";

        booking.proposalHistory.push({
            serviceCategoryName: p.serviceCategoryName,
            price: p.price,
            proposedBy: booking.primaryEmployee,
            status: "APPROVED",
            proposedAt: new Date()
        });

        await booking.save();

        if (employee?.socketId) {
            io.to(employee.socketId).emit("service-approved", {
                bookingId,
                service: p.serviceCategoryName,
                totalPrice: p.price
            });
        }

    } catch (err) {
        console.error("approveVisitServiceSocket:", err.message);
    }
};

exports.proposeExtraService = async ({ bookingId, serviceCategoryId, employeeId, io }) => {
    const booking = await Booking.findById(bookingId).populate("user").populate("primaryEmployee");
    if (!booking) throw new AppError("Booking not found", 404);

    // Only workers on the booking can propose extra services
    const isAssigned = booking.employees.some(emp => emp.toString() === employeeId) ||
        (booking.primaryEmployee && booking.primaryEmployee._id.toString() === employeeId);

    if (!isAssigned) {
        throw new AppError("Unauthorized: Only assigned employees can propose extra services", 403);
    }

    const serviceList = await ServiceList.findOne({
        "serviceCategory._id": serviceCategoryId
    });

    if (!serviceList) throw new AppError("Service category not found", 404);

    const category = serviceList.serviceCategory.find(
        c => c._id.toString() === serviceCategoryId.toString()
    );

    const extraService = {
        serviceCategoryId,
        serviceName: category.serviceCategoryName,
        price: category.price,
        durationInMinutes: category.durationInMinutes,
        status: "PENDING",
        requestedAt: new Date()
    };

    booking.extraServices.push(extraService);
    await booking.save();

    // Get the newly added service with its ID
    const addedService = booking.extraServices[booking.extraServices.length - 1];

    if (booking.user?.socketId) {
        io.to(booking.user.socketId).emit("extra-service-proposed", {
            bookingId: booking._id,
            extraService: addedService
        });
    }

    return addedService;
};

exports.approveExtraService = async ({ bookingId, extraServiceId, approve, userId, io }) => {
    const booking = await Booking.findById(bookingId).populate("primaryEmployee");
    if (!booking) throw new AppError("Booking not found", 404);

    if (booking.user.toString() !== userId) {
        throw new AppError("Unauthorized: Only the customer can approve extra services", 403);
    }
    console.log(extraServiceId);    // Fallback: search by _id string or serviceCategoryId if .id() fails
    let extraService = booking.extraServices.id(extraServiceId);
    if (!extraService) {
        console.log("Subdocument .id() failed. Falling back to find()...");
        extraService = booking.extraServices.find(s =>
            s._id.toString() === extraServiceId.toString() ||
            (s.serviceCategoryId && s.serviceCategoryId.toString() === extraServiceId.toString())
        );
    }

    if (!extraService) {
        console.error("DEBUG: extraService not found. Available IDs:", booking.extraServices.map(s => s._id.toString()));
        console.error("DEBUG: Available Category IDs:", booking.extraServices.map(s => s.serviceCategoryId?.toString()));
        throw new AppError("Extra service request not found", 404);
    }

    if (extraService.status !== "PENDING") {
        throw new AppError("Extra service request already processed", 400);
    }

    if (approve) {
        extraService.status = "APPROVED";
        extraService.approvedAt = new Date();
        booking.totalPrice += Number(extraService.price || 0);
        booking.totalServicePrice += Number(extraService.price || 0);
        booking.durationInMinutes += Number(extraService.durationInMinutes || 0);

        // Add to regular proposal history for tracking
        booking.proposalHistory.push({
            serviceCategoryName: extraService.serviceName,
            price: extraService.price,
            proposedBy: booking.primaryEmployee?._id || booking.primaryEmployee,
            status: "APPROVED_EXTRA",
            proposedAt: extraService.requestedAt
        });
    } else {
        extraService.status = "REJECTED";
    }

    await booking.save();

    // Notify primary employee
    const primaryEmployee = await SingleEmployee.findById(booking.primaryEmployee);
    if (primaryEmployee?.socketId) {
        io.to(primaryEmployee.socketId).emit("extra-service-response", {
            bookingId,
            extraServiceId,
            status: extraService.status,
            totalPrice: booking.totalPrice,
            durationInMinutes: booking.durationInMinutes,
            extraServices: booking.extraServices
        });
    }

    // Notify user
    const userUpdate = await User.findById(booking.user);
    if (userUpdate?.socketId) {
        io.to(userUpdate.socketId).emit("extra-service-response", {
            bookingId,
            extraServiceId,
            status: extraService.status,
            totalPrice: booking.totalPrice,
            durationInMinutes: booking.durationInMinutes,
            extraServices: booking.extraServices
        });
    }

    return { booking, status: extraService.status };
};

