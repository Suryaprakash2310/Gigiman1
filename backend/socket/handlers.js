const User = require("../models/user.model");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ToolShop = require("../models/toolshop.model");
const PartRequest = require("../models/partsrequest.model");
const Booking = require("../models/Booking.model");

const {
    findNearbyTeams,
    startServicerQueue,
    servicerAccept,
    servicerReject,

    startTeamQueue,
    teamAccept,
    teamReject,

    createBooking,
    generateStartOTP,
    verifyStartOTP,
    requestTool,
    findNearbyToolShops,

    startToolShopQueue,
    toolshopAccept,
    toolshopReject,

    generateToolOTP,
    verifyToolOTP,
} = require("../services/booking.service");

const BOOKING_STATUS = require("../enum/bookingstatus.enum");

module.exports = (io) => {
    io.on("connection", (socket) => {
        console.log("Connected:", socket.id);

        /* ===============================
           REGISTER SOCKETS
        =============================== */
        socket.on("register-user", async ({ userId }) => {
            await User.findByIdAndUpdate(userId, { socketId: socket.id });
        });

        socket.on("register-employee", async ({ employeeId }) => {
            await SingleEmployee.findByIdAndUpdate(employeeId, {
                socketId: socket.id,
                isActive: true,
            });
        });

        socket.on("register-team", async ({ teamId }) => {
            await MultipleEmployee.findByIdAndUpdate(teamId, {
                socketId: socket.id,
                isActive: true,
            });
        });

        socket.on("register-toolshop", async ({ shopId }) => {
            await ToolShop.findByIdAndUpdate(shopId, { socketId: socket.id });
        });

        /* ===============================
           SEARCH
        =============================== */
        socket.on("search-service", async (payload) => {
            try {
                const result = await findNearbyTeams(payload);
                socket.emit("nearby-services", result);
            } catch (err) {
                socket.emit("error", { message: err.message });
            }
        });

        /* ===============================
           AUTO ASSIGN
        =============================== */
        socket.on("booking-service", async ({ userId, servicers, type, tempBookingId }) => {
            const user = await User.findById(userId);
            if (!user?.socketId) return;

            if (type === "single") {
                return startServicerQueue({
                    bookingId: tempBookingId,
                    servicers,
                    userSocket: user.socketId,
                    io,
                });
            }

            if (type === "team") {
                return startTeamQueue({
                    bookingId: tempBookingId,
                    teams: servicers,
                    userSocket: user.socketId,
                    io,
                });
            }

            socket.emit("error", { message: "Invalid booking type" });
        });
        socket.on("booking-create-final", async (payload) => {
            const result = await createBooking({
                ...payload,
                serviceCount: payload.serviceCount || 1,
            });
        });


        /* ===============================
           ACCEPT / REJECT
        =============================== */
        socket.on("servicer-accept", ({ bookingId, employeeId }) =>
            servicerAccept(bookingId, employeeId, io)
        );

        socket.on("servicer-reject", ({ bookingId }) =>
            servicerReject(bookingId, io)
        );

        socket.on("team-accept", ({ bookingId, teamId }) =>
            teamAccept(bookingId, teamId, io)
        );

        socket.on("team-reject", ({ bookingId }) =>
            teamReject(bookingId, io)
        );

        /* ===============================
           TEAM ASSIGN
        =============================== */
        socket.on("team-assign-members", async ({ bookingId, primaryEmployee, helpers = [] }) => {
            const booking = await Booking.findByIdAndUpdate(
                bookingId,
                {
                    primaryEmployee,
                    employees: [primaryEmployee, ...helpers],
                },
                { new: true }
            );

            if (!booking) return;

            const user = await User.findById(booking.user);
            user?.socketId &&
                io.to(user.socketId).emit("team-assigned", booking);

            const employees = await SingleEmployee.find({
                _id: { $in: booking.employees },
            });

            employees.forEach((emp) => {
                emp.socketId &&
                    io.to(emp.socketId).emit("team-member-assigned", booking);
            });
        });

        /* ===============================
           FINAL BOOKING CREATE
        =============================== */
        socket.on("booking-create-final", async (payload) => {
            const result = await createBooking(payload);
            const user = await User.findById(payload.userId);

            user?.socketId &&
                io.to(user.socketId).emit("booking-created", result.booking);

            if (result.assignedEmployees?.length) {
                const emps = await SingleEmployee.find({
                    _id: { $in: result.assignedEmployees },
                });

                emps.forEach((e) => {
                    e.socketId &&
                        io.to(e.socketId).emit("new-booking-assigned", result.booking);
                });
            }
        });

        /* ===============================
           SERVICER CANCEL (FIXED)
        =============================== */
        socket.on("servicer-cancel", async ({ bookingId, employeeId }) => {
            const booking = await Booking.findById(bookingId);
            if (!booking) return;

            booking.employees = booking.employees.filter(
                (e) => e.toString() !== employeeId
            );

            if (booking.primaryEmployee?.toString() === employeeId) {
                booking.primaryEmployee = null;
            }

            await booking.save();

            const user = await User.findById(booking.user);
            user?.socketId &&
                io.to(user.socketId).emit("servicer-cancelled", bookingId);

            await startServicerQueue({
                bookingId,
                servicers: booking.employees,
                userSocket: user?.socketId,
                io,
            });

            const emp = await SingleEmployee.findById(employeeId);
            if (emp) {
                emp.cancelCount = (emp.cancelCount || 0) + 1;
                if (emp.cancelCount >= 3) {
                    emp.blockedUntil = new Date(Date.now() + 3 * 86400000);
                    emp.cancelCount = 0;
                }
                await emp.save();
            }
        });

        /* ===============================
           USER CANCEL
        =============================== */
        socket.on("user-cancel-booking", async ({ bookingId }) => {
            const booking = await Booking.findByIdAndUpdate(
                bookingId,
                { status: BOOKING_STATUS.CANCELLED },
                { new: true }
            );
            if (!booking) return;

            const employees = await SingleEmployee.find({
                _id: { $in: booking.employees },
            });

            employees.forEach((e) => {
                e.socketId &&
                    io.to(e.socketId).emit("booking-cancelled-by-user", bookingId);
            });
        });

        /* ===============================
           START WORK OTP
        =============================== */
        socket.on("generate-otp", async ({ bookingId }) => {
            const { booking, otp } = await generateStartOTP(bookingId);
            if (!booking) return;

            const user = await User.findById(booking.user);
            user?.socketId &&
                io.to(user.socketId).emit("start-work-otp", otp);
        });

        socket.on("verify-start-otp", async ({ bookingId, otp }) => {
            const result = await verifyStartOTP(bookingId, otp);
            if (!result.success) {
                return socket.emit("otp-failed");
            }

            const booking = result.booking;
            const employees = await SingleEmployee.find({
                _id: { $in: booking.employees },
            });

            employees.forEach((e) => {
                e.socketId &&
                    io.to(e.socketId).emit("otp-success", booking);
            });
        });

        /* ===============================
           TOOL REQUEST
        =============================== */
        socket.on("tool-request", async ({ bookingId, toolName }) => {
            const booking = await requestTool(bookingId, toolName);
            const user = await User.findById(booking.user);

            user?.socketId &&
                io.to(user.socketId).emit("tool-permission-request", booking);
        });

        socket.on("tool-permission-approved", async ({ bookingId, coordinates }) => {
            const shops = await findNearbyToolShops({ coordinates });
            await startToolShopQueue({
                requestId: bookingId,
                shops: shops.map((s) => s._id),
                employeeSocket: socket.id,
                io,
            });
        });

        socket.on("toolshop-accept", ({ requestId, shopId }) =>
            toolshopAccept(requestId, shopId, io)
        );

        socket.on("toolshop-reject", ({ requestId }) =>
            toolshopReject(requestId, io)
        );

        /* ===============================
           PART REQUEST
        =============================== */
        socket.on("parts-request", async (data) => {
            const req = await PartRequest.create(data);
            const booking = await Booking.findById(data.bookingId);
            const user = await User.findById(booking.user);

            user?.socketId &&
                io.to(user.socketId).emit("parts-approval-request", req);
        });

        /* ===============================
           PAYMENT
        =============================== */
        socket.on("payment-success", async ({ bookingId }) => {
            const booking = await Booking.findById(bookingId).populate("user");
            booking?.user?.socketId &&
                io.to(booking.user.socketId).emit("payment-confirmed", bookingId);
        });

        /* ===============================
           DISCONNECT
        =============================== */
        socket.on("disconnect", async () => {
            await User.updateOne({ socketId: socket.id }, { socketId: null });
            await SingleEmployee.updateOne({ socketId: socket.id }, { socketId: null, isActive: false });
            await MultipleEmployee.updateOne({ socketId: socket.id }, { socketId: null, isActive: false });
            await ToolShop.updateOne({ socketId: socket.id }, { socketId: null });
        });
    });
};
