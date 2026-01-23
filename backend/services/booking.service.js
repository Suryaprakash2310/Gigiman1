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
const User = require("../models/user.model");

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
    console.log("Finding teams near:", lng, lat);

    // Employees capable of this domain
    const capableEmployees = await EmployeeService.find({
        capableservice: domainServiceId,
    });

    const capableEmployeeIds = capableEmployees.map(e => e.employeeId);
    const capableEmployeeObjectIds = capableEmployeeIds.map(
        id => new mongoose.Types.ObjectId(id)
    );
    console.log("Capable Employee IDs:", capableEmployeeObjectIds);

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
        console.log('available employees singles:', singles);

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

    // const capableEmployee = await SingleEmployee.find({
    //     empId: { $in: capableEmployeeIds } // strings from frontend
    // }).select("_id");

    // const capableObjectIds = capableEmployee.map(e => e._id);
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

    console.log("FOUND TEAMS:", teams.length);


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
            (ack) => {
                if (!ack) {
                    console.log("++++++++++++++Provider did not acknowledge booking");
                }
            }
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

        //  retry (event-driven, not loop)
        exports.assignNextServicer({ bookingId, coordinates, io });
    }, 150000); //  2.5 minutes
};

// exports.servicerAccept = async (bookingId, employeeId, io) => {
//     const employee = await SingleEmployee.findOne({
//         _id: employeeId,
//         offerBookingId: bookingId,
//         availabilityStatus: "OFFERED",
//     });

//     if (!employee) return;
//     const booking = await Booking.findOneAndUpdate(
//         {
//             _id: bookingId,
//             primaryEmployee: null,
//             status: BOOKING_STATUS.PENDING,
//         },
//         {
//             $set: {
//                 primaryEmployee: employeeId,
//                 employees: [employeeId],
//             },
//         },
//         { new: true }
//     );
//     if (!booking) {
//         await SingleEmployee.findByIdAndUpdate(employeeId, {
//             availabilityStatus: "AVAILABLE",
//             offerBookingId: null,
//         });
//         return;
//     }
//     // console.log(booking);
//     await SingleEmployee.findByIdAndUpdate(employeeId, {
//         availabilityStatus: "BUSY",
//         offerBookingId: null,
//     });

//     const user = await User.findById(booking.user).select("socketId");
//     if (user?.socketId) {
//         console.log("Emitting servicer-accepted to user:", user.socketId, bookingId);
//         io.to(user.socketId).emit("servicer-accepted", booking);
//     }
// };

exports.servicerAccept = async (bookingId, employeeId, io) => {
    // 1️⃣ Assign employee to booking
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

    // 2️⃣ 🔐 GENERATE OTP IMMEDIATELY AFTER ACCEPT
    const { booking: updatedBooking, otp } =
        await this.generateStartOTP(booking._id);

    console.log("🔐 OTP GENERATED:", otp);

    // 3️⃣ Notify USER with booking + OTP
    const user = await User.findById(updatedBooking.user).select("socketId");

    if (user?.socketId) {
        io.to(user.socketId).emit("servicer-accepted", {
            booking: updatedBooking,
            otp,
        });
    }

    await SingleEmployee.findByIdAndUpdate(employeeId, {
        availabilityStatus: "BUSY",
        offerBookingId: null,
    });

    const otp = Math.floor(1000 + Math.random() * 9000);
    booking.StartWorkOTP = otp;
    await booking.save();

    // Notify user
    const user = await User.findById(booking.user).select("socketId");
    if (user?.socketId) {
        io.to(user.socketId).emit("servicer-accepted", booking);
        io.to(user.socketId).emit("start-work-otp", otp);
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
        console.log("📤 EMITTING TEAM REQUEST TO:", team.socketId);
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

        console.log("🟡 teamAcceptAndAssign START", {
            bookingId,
            teamId,
            leaderEmpId,
            helperCount: helperEmpIds.length
        });

        /* 1️⃣ Fetch team */
        const team = await MultipleEmployee.findOne(
            {
                _id: teamId,
                offerBookingId: bookingId,
                teamStatus: "OFFERED"
            },
            { members: 1, leader: 1, helpers: 1 }
        );

        console.log("team fetched:", team ? { id: team._id?.toString(), membersCount: team.members?.length } : null);

        if (!team) {
            return { success: false, reason: "Invalid team offer" };
        }

        /* 2️⃣ Fetch leader */
        const leader = await SingleEmployee.findById(leaderEmpId);
        console.log("leader fetched:", leader ? { id: leader._id?.toString(), empId: leader.empId, socketId: leader.socketId } : null);
        if (!leader) {
            return { success: false, reason: "Leader not found" };
        }

        /* 3️⃣ Build MEMBER SET (O(1) lookups) */
        const memberIdSet = new Set(
            team.members.map(m => m.toString())
        );

        console.log("memberIdSet size:", memberIdSet.size);

        /* 4️⃣ Validate leader is a team member */
        if (!memberIdSet.has(leader._id.toString())) {
            console.log("leader not in team members", { leaderId: leader._id.toString() });
            return {
                success: false,
                reason: "Leader must be a member of the team"
            };
        }

        /* 2️⃣.5️⃣ Fetch booking EARLY (read-only) */
        const bookingMeta = await Booking.findById(bookingId)
            .select("employeeCount status serviceType user");

        if (!bookingMeta) {
            return { success: false, reason: "Booking not found" };
        }

        if (bookingMeta.status !== BOOKING_STATUS.PENDING) {
            return { success: false, reason: "Booking not pending" };
        }


        /* 5️⃣ Fetch helpers */
        let helperDocs = [];
        if (helperEmpIds.length) {
            helperDocs = await SingleEmployee.find({
                _id: { $in: helperEmpIds }
            });

            console.log("helpers fetched count:", helperDocs.length, "expected:", helperEmpIds.length);

            if (helperDocs.length + 1 !== bookingMeta.employeeCount) {
                return {
                    success: false,
                    reason: `Requires ${bookingMeta.employeeCount} employees`
                };
            }

            /* 6️⃣ Validate helpers using SET (FAST) */
            const invalidHelper = helperDocs.find(
                h => !memberIdSet.has(h._id.toString())
            );

            if (invalidHelper) {
                console.log("invalid helper detected:", { empId: invalidHelper.empId, id: invalidHelper._id.toString() });
                return {
                    success: false,
                    reason: `Helper ${invalidHelper.empId} is not a team member`
                };
            }
        }

        /* 7️⃣ Assign roles to team */
        team.leader = leader._id;
        team.helpers = helperDocs.map(h => h._id);
        console.log("assigning leader/helpers to team", { leader: leader._id.toString(), helpers: team.helpers.map(h => h.toString()) });
        await team.save();
        console.log("team after save:", { id: team._id.toString(), leader: team.leader.toString(), helpers: team.helpers.map(h => h.toString()) });

        /* 8️⃣ Lock booking */
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
                status: BOOKING_STATUS.ASSIGNED // 🔥 REQUIRED
            },
            { new: true }
        );

        console.log("booking lock result:", booking ? { id: booking._id.toString(), servicerCompany: booking.servicerCompany?.toString(), status: booking.status } : null);

        if (!booking) {
            return {
                success: false,
                reason: "Booking already assigned"
            };
        }

        /* 9️⃣ Generate OTP */
        const otp = Math.floor(1000 + Math.random() * 9000);
        booking.StartWorkOTP = otp;
        await booking.save();

        console.log("otp generated and saved:", otp);

        /* 🔟 Mark team BUSY */
        const teamUpdate = await MultipleEmployee.findByIdAndUpdate(teamId, {
            teamStatus: "BUSY",
            offerBookingId: null
        }, { new: true });
        console.log("team status updated to BUSY:", teamUpdate ? { id: teamUpdate._id.toString(), status: teamUpdate.teamStatus } : null);

        /* 1️⃣1️⃣ Notify USER */
        const user = await User.findById(booking.user).select("socketId");
        if (user?.socketId) {
            io.to(user.socketId).emit("otp-generated", {
                bookingId: booking._id,
                otp
            });
            console.log("notified user of otp", { userSocket: user.socketId, bookingId: booking._id.toString() });
        }

        /* 1️⃣2️⃣ Notify LEADER */
        const leaderSocket = await SingleEmployee.findById(leader._id).select("socketId");
        if (leaderSocket?.socketId) {
            io.to(leaderSocket.socketId).emit("leader-otp-ready", {
                bookingId: booking._id
            });
            console.log("notified leader socket", { leaderSocket: leaderSocket.socketId, leaderId: leader._id.toString() });
        }

        console.log("✅ teamAcceptAndAssign SUCCESS", {
            bookingId: booking._id.toString(),
            teamId: teamId.toString()
        });

        return {
            success: true,
            bookingId: booking._id
        };

    } catch (err) {
        console.error("🔥 teamAcceptAndAssign error:", err && err.stack ? err.stack : err);
        return {
            success: false,
            reason: err.message
        };
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
        throw new Error("Invalid service count");
    }

    /* -------------------------
       Fetch service category
    ------------------------- */
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
    if (
        !Array.isArray(coordinates) ||
        coordinates.length !== 2 ||
        typeof coordinates[0] !== "number" ||
        typeof coordinates[1] !== "number"
    ) {
        throw new Error("Invalid or missing coordinates");
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


// exports.teamAcceptBooking = async ({ bookingId, teamId }) => {
//     const booking = await Booking.findById(bookingId);
//     if (!booking) throw new Error("Booking not found");

//     const team = await MultipleEmployee.findById(teamId).populate("members leader");
//     if (!team) throw new Error("Team not found");

//     // select employees (example logic)
//     const primaryEmployee = team.leader._id;
//     const helpers = team.members
//         .filter(m => m._id.toString() !== primaryEmployee.toString())
//         .slice(0, booking.employeeCount - 1);

//     const assignedEmployees = [primaryEmployee, ...helpers.map(h => h._id)];

//     booking.primaryEmployee = primaryEmployee;
//     booking.employees = assignedEmployees;

//     await booking.save();

//     return {
//         booking,
//         assignedEmployees,
//         primaryEmployee,
//         helpers,
//         serviceType: "team",
//     };
// };


/* ======================================================
   6. START WORK OTP
====================================================== */
// exports.generateStartOTP = async (bookingId) => {
//     const booking = await Booking.findById(bookingId);

//     if (!booking) {
//         throw new Error("Booking not found");
//     }

//     //  Employee must be assigned first
//     if (!booking.primaryEmployee) {
//         throw new Error("Cannot generate OTP before employee assignment");
//     }

//     // OTP only allowed before work starts
//     if (booking.status !== BOOKING_STATUS.PENDING) {
//         throw new Error("OTP can only be generated before work starts");
//     }

//     const otp = Math.floor(1000 + Math.random() * 9000);

//     booking.StartWorkOTP = otp;
//     await booking.save();

//     return { booking, otp };
// };


exports.verifyStartOTP = async (bookingId, otp) => {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
        return { success: false, message: "Booking not found" };
    }
    //  OTP must exist
    if (!booking.StartWorkOTP) {
        return { success: false, message: "OTP not generated or already used" };
    }
    //  Status must be correct
    if (booking.status !== BOOKING_STATUS.PENDING) {
        return { success: false, message: "Invalid booking state" };
    }
    //  OTP validation
    if (booking.StartWorkOTP !== Number(otp)) {
        return { success: false, message: "Invalid OTP" };
    }
    //  OTP verified → start work
    booking.StartWorkOTP = null;
    booking.status = BOOKING_STATUS.IN_PROGRESS;
    await booking.save();

    return { success: true, booking };
};
// Called AFTER API verifyStartOTP succeeds
exports.notifyOtpSuccess = async (booking, io) => {
    const employees = await SingleEmployee.find({
        _id: { $in: booking.employees },
    }).select("socketId");

    employees.forEach(emp => {
        if (emp.socketId && io.sockets.sockets.get(emp.socketId)) {
            io.to(emp.socketId).emit("otp-success", {
                bookingId: booking._id,
                status: booking.status,
            });
        }
    });
};

/* ======================================================
   7. TOOLSHOP FLOW
====================================================== */
exports.assignNextToolshop = async ({ requestId, coordinates, io }) => {
    const [lng, lat] = coordinates;
    console.log("🔍 +++++++++Searching toolshop for request:", requestId);

    //  Pick + lock ONE toolshop atomically
    const shop = await ToolShop.findOneAndUpdate(
        {
            isActive: true,
            shopStatus: "AVAILABLE",
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
            $set: {
                shopStatus: "OFFERED",
                offerRequestId: requestId,
            },
        },
        { new: true }
    );
    console.log("➡️ Selected toolshop:", shop);

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
    console.log("➡️ Offered toolshop:", shop.socketId);

    //  Single timeout (retry)
    setTimeout(async () => {
        const stillOffered = await ToolShop.findOne({
            _id: shop._id,
            offerRequestId: requestId,
            shopStatus: "OFFERED",
        });

        if (!stillOffered) return;

        await ToolShop.findByIdAndUpdate(shop._id, {
            shopStatus: "AVAILABLE",
            offerRequestId: null,
        });

        exports.assignNextToolshop({ requestId, coordinates, io });
    }, 15000);
};


exports.toolshopAccept = async ({ requestId, shopId, io }) => {
    const shop = await ToolShop.findOne({
        _id: shopId,
        offerRequestId: requestId,
        shopStatus: "OFFERED",
    });

    console.log("🔔 Toolshop accept attempt:", shopId, requestId);

    if (!shop) {
        console.log("❌ Invalid shop accept attempt");
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
            shopStatus: "AVAILABLE",
            offerRequestId: null,
        });
        return;
    }

    // ✅ Mark shop BUSY
    await ToolShop.findByIdAndUpdate(shopId, {
        shopStatus: "BUSY",
        offerRequestId: null,
    });

    console.log("✅ OTP generated:", otp);

    // ✅ Get employee socket
    const employee = await SingleEmployee
        .findById(request.employeeId)
        .select("socketId");
    console.log("✅ Employee socket:", employee);

    if (!employee?.socketId) {
        console.log("❌ Employee socket missing");
        return;
    }

    // ✅ Emit pickup details
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

    console.log("✅ Toolshop accepted → Employee notified");
};



exports.toolshopReject = async ({ requestId, shopId, io }) => {

    const shop = await ToolShop.findOne({
        _id: shopId,
        offerRequestId: requestId,
        shopStatus: "OFFERED",
    });

    if (!shop) return;

    await ToolShop.findByIdAndUpdate(shopId, {
        shopStatus: "AVAILABLE",
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

    // 1️⃣ Validate booking
    const booking = await Booking.findOne({
        _id: bookingId,
        primaryEmployee: employeeId,
        status: BOOKING_STATUS.IN_PROGRESS,
    });

    if (!booking) {
        throw new Error("Invalid booking or employee not assigned");
    }

    // 2️⃣ Prevent duplicate active requests (ENUM SAFE)
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
        throw new Error("Active part request already exists");
    }

    // 3️⃣ Create part request
    const partRequest = await PartRequest.create({
        bookingId,
        employeeId,
        parts,
        totalCost,
        status: PART_REQUEST_STATUS.REQUESTED,
        approvalByUser: false,
        otp: null,
    });

    // 4️⃣ Emit to USER (best-effort)
    if (io && booking.user) {
        console.log("Emitting tool-request-created to user:", booking.user.toString());
        io.to(booking.user.toString()).emit("tool-request-created", {
            requestId: partRequest._id,
            parts,
            totalCost,
        }, (ack) => {
            if (!ack) {
                console.log("++++++++++++++User did not acknowledge part request");
            }
        });
    }

    return partRequest;
};


    const req = await PartRequest.findOne({
        _id: requestId,
        status: PART_REQUEST_STATUS.READY_FOR_PICKUP,
    });

    if (!req) {
        throw new Error("OTP can only be generated after shop acceptance");
    }

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000);

    req.otp = otp;
    await req.save();

    return {
        requestId: req._id,
        otp,
    };
};
exports.verifyPartOTP = async (requestId, otp, io) => {
    console.log("Verifying Part OTP:", requestId, otp);
    //  Validate request
    const req = await PartRequest.findOne({
        _id: requestId,
        status: "approved",
        otp: Number(otp),
    });

    if (!req) {
        return { success: false, message: "Invalid OTP or request not approved" };
    }

    //  Mark as collected
    req.status = PART_REQUEST_STATUS.COLLECTED;
    req.otp = null;
    await req.save();
    const booking = await Booking.findById(req.bookingId);
    if (!booking) {
        return { success: false };
    }

    booking.totalPrice += req.totalCost;
    await booking.save();
    return {
        success: true,
        booking,
        req,
    };
};
