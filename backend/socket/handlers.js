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

module.exports = (io) => {
    io.on("connection", (socket) => {
        console.log("Connected:", socket.id);

        // ===============================
        // REGISTER SOCKET IDs
        // ===============================
        socket.on("register-user", async ({ userId }) => {
            try {
                await User.findByIdAndUpdate(userId, { socketId: socket.id });
            } catch (err) {
                console.error("register-user error:", err.message);
            }
        });

        socket.on("register-employee", async ({ employeeId }) => {
            try {
                await SingleEmployee.findByIdAndUpdate(employeeId, { socketId: socket.id });
            } catch (err) {
                console.error("register-employee error:", err.message);
            }
        });

        socket.on("register-team", async ({ teamId }) => {
            try {
                await MultipleEmployee.findByIdAndUpdate(teamId, { socketId: socket.id });
            } catch (err) {
                console.error("register-team error:", err.message);
            }
        });

        socket.on("register-toolshop", async ({ shopId }) => {
            try {
                await ToolShop.findByIdAndUpdate(shopId, { socketId: socket.id });
            } catch (err) {
                console.error("register-toolshop error:", err.message);
            }
        });



        // ===============================
        // SEARCH NEARBY SERVICERS (AUTO SEARCH VIA SOCKET)
        // ===============================
        socket.on("search-service", async ({ address, coordinates, serviceCategoryName }) => {
            try {
                const result = await findNearbyTeams({
                    address,
                    coordinates,
                    serviceCategoryName,
                });

                // Send nearby single/team data back to this user
                socket.emit("nearby-services", result);
            } catch (err) {
                console.error("search-service error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });



        // ========================================================
        // BOOKING REQUEST (AUTO ASSIGN → SINGLE / TEAM)
        // ========================================================
        socket.on("booking-service", async (payload) => {
            try {
                const {
                    userId,
                    servicers,
                    type, // "single" or "team"
                } = payload;

                const user = await User.findById(userId);
                if (!user?.socketId) {
                    console.warn("User socket not registered for userId:", userId);
                    return;
                }

                // -------------------------
                // SINGLE EMPLOYEE AUTO ASSIGN
                // -------------------------
                if (type === "single") {
                    await startServicerQueue({
                        bookingId: payload.tempBookingId,
                        servicers,
                        userSocket: user.socketId,
                        io,
                    });
                    return;
                }

                // -------------------------
                // TEAM AUTO ASSIGN
                // -------------------------
                if (type === "team") {
                    await startTeamQueue({
                        bookingId: payload.tempBookingId,
                        teams: servicers,
                        userSocket: user.socketId,
                        io,
                    });
                    return;
                }

                socket.emit("error", { message: "Invalid booking type" });

            } catch (err) {
                console.error("booking-service error:", err);
                socket.emit("error", { message: err.message });
            }
        });



        // ========================================================
        // SERVICER ACCEPTS / REJECTS BOOKING
        // ========================================================
        socket.on("servicer-accept", async ({ bookingId, employeeId }) => {
            try {
                await servicerAccept(bookingId, employeeId, io);
            } catch (err) {
                console.error("servicer-accept error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });

        socket.on("servicer-reject", async ({ bookingId }) => {
            try {
                await servicerReject(bookingId, io);
            } catch (err) {
                console.error("servicer-reject error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });



        // ========================================================
        // TEAM ACCEPTS / REJECTS BOOKING
        // ========================================================
        socket.on("team-accept", async ({ bookingId, teamId }) => {
            try {
                await teamAccept(bookingId, teamId, io);
            } catch (err) {
                console.error("team-accept error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });

        socket.on("team-reject", async ({ bookingId }) => {
            try {
                await teamReject(bookingId, io);
            } catch (err) {
                console.error("team-reject error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });



        // ========================================================
        // TEAM LEADER ASSIGNS PRIMARY + HELPERS 
        // ========================================================
        socket.on("team-assign-members", async ({ bookingId, primaryEmployee, helpers = [] }) => {
            try {
                // 1) Update booking 
                const booking = await Booking.findByIdAndUpdate(
                    bookingId,
                    {
                        primaryEmployee,
                        employees: [primaryEmployee, ...helpers],
                    },
                    { new: true }
                );

                if (!booking) {
                    return socket.emit("error", { message: "Booking not found" });
                }

                // 2) Update MultipleEmployee leader + helpers (SCALABLE)
                if (booking.servicerCompany) {
                    const primaryDoc = await SingleEmployee.findById(primaryEmployee);
                    if (primaryDoc) {
                        const helperDocs = helpers.length
                            ? await SingleEmployee.find({ _id: { $in: helpers } }) // single query
                            : [];

                        const leaderEmpId = primaryDoc.empId;
                        const helperEmpIds = helperDocs.map(h => h.empId);

                        await MultipleEmployee.findByIdAndUpdate(
                            booking.servicerCompany,
                            {
                                leader: leaderEmpId,
                                helpers: helperEmpIds,
                            },
                            { new: true }
                        );
                    }
                }

                // 3) Notify user
                const user = await User.findById(booking.user);
                if (user?.socketId) {
                    io.to(user.socketId).emit("team-assigned", {
                        booking,
                        primaryEmployee,
                        helpers,
                    });
                }

                // 4) Notify primary
                const primaryDoc = await SingleEmployee.findById(primaryEmployee);
                if (primaryDoc?.socketId) {
                    io.to(primaryDoc.socketId).emit("team-primary-assigned", {
                        booking,
                        role: "primary",
                    });
                }

                // 5) Notify helpers (SCALABLE – NO async loop)
                const helperDocs = helpers.length
                    ? await SingleEmployee.find({ _id: { $in: helpers } })
                    : [];

                helperDocs.forEach(helper => {
                    if (helper.socketId) {
                        io.to(helper.socketId).emit("team-helper-assigned", {
                            booking,
                            role: "helper",
                        });
                    }
                });

            } catch (err) {
                console.error("team-assign-members ERROR:", err);
                socket.emit("error", { message: err.message });
            }
        });





        // ========================================================
        // CREATE BOOKING AFTER ACCEPT (SINGLE / TEAM)
        // ========================================================

        socket.on("booking-create-final", async (payload) => {
            try {
                const result = await createBooking(payload);

                const user = await User.findById(payload.userId);
                if (user?.socketId) {
                    io.to(user.socketId).emit("booking-created", result.booking);
                }

                const { assignedEmployees } = result;

                for (const empId of assignedEmployees) {
                    const emp = await SingleEmployee.findById(empId);
                    if (emp?.socketId) {
                        io.to(emp.socketId).emit("new-booking-assigned", result.booking);
                    }
                }

            } catch (err) {
                console.error("booking-create-final ERROR:", err);
                socket.emit("error", { message: err.message });
            }
        });



        // ========================================================
        // START WORK OTP
        // ========================================================
        socket.on("generate-otp", async ({ bookingId }) => {
            try {
                const { booking, otp } = await generateStartOTP(bookingId);

                if (!booking) {
                    return socket.emit("error", { message: "Booking not found" });
                }

                const user = await User.findById(booking.user);
                if (user?.socketId) {
                    io.to(user.socketId).emit("start-work-otp", { otp });
                }

                const primary = booking.primaryEmployee || booking.employees[0];
                const emp = await SingleEmployee.findById(primary);
                if (emp?.socketId) {
                    io.to(emp.socketId).emit("start-work-otp-servicer", { bookingId, otp });
                }

            } catch (err) {
                console.error("generate-otp error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });

        socket.on("verify-start-otp", async ({ bookingId, otp }) => {
            try {
                const result = await verifyStartOTP(bookingId, otp);

                if (!result.success) {
                    return socket.emit("otp-failed", { message: "Invalid OTP" });
                }

                const booking = result.booking;

                const user = await User.findById(booking.user);
                if (user?.socketId) {
                    io.to(user.socketId).emit("otp-success", booking);
                }

                // notify all employees
                for (const empId of booking.employees) {
                    const emp = await SingleEmployee.findById(empId);
                    if (emp?.socketId) {
                        io.to(emp.socketId).emit("otp-success", booking);
                    }
                }

            } catch (err) {
                console.error("verify-start-otp error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });



        // ========================================================
        // TOOL REQUEST FLOW
        // ========================================================
        socket.on("tool-request", async ({ bookingId, toolName }) => {
            try {
                const booking = await requestTool(bookingId, toolName);

                const user = await User.findById(booking.user);
                if (user?.socketId) {
                    io.to(user.socketId).emit("tool-permission-request", {
                        bookingId,
                        toolName,
                    });
                }

            } catch (err) {
                console.error("tool-request error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });

        // After user approves on frontend
        socket.on("tool-permission-approved", async ({ bookingId, coordinates }) => {
            try {
                const shops = await findNearbyToolShops({ coordinates });
                const ids = shops.map((s) => s._id.toString());

                await startToolShopQueue({
                    requestId: bookingId,
                    shops: ids,
                    employeeSocket: socket.id,
                    io,
                });

                socket.emit("nearby-toolshops", shops);

            } catch (err) {
                console.error("tool-permission-approved error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });

        socket.on("toolshop-accept", async ({ requestId, shopId }) => {
            try {
                await toolshopAccept(requestId, shopId, io);
            } catch (err) {
                console.error("toolshop-accept error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });

        socket.on("toolshop-reject", async ({ requestId }) => {
            try {
                await toolshopReject(requestId, io);
            } catch (err) {
                console.error("toolshop-reject error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });



        // ========================================================
        // TOOL OTP
        // ========================================================
        socket.on("generate-tool-otp", async ({ bookingId, shopId }) => {
            try {
                const { booking, otp } = await generateToolOTP(bookingId, shopId);

                if (!booking) {
                    return socket.emit("error", { message: "Booking not found" });
                }

                const shop = await ToolShop.findById(shopId);
                if (shop?.socketId) {
                    io.to(shop.socketId).emit("tool-pickup-request", {
                        bookingId,
                        otp,
                    });
                }

            } catch (err) {
                console.error("generate-tool-otp error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });

        socket.on("verify-tool-otp", async ({ bookingId, otp }) => {
            try {
                const result = await verifyToolOTP(bookingId, otp);

                if (!result.success) {
                    return socket.emit("tool-shop-failed", { message: "Invalid OTP" });
                }

                const booking = result.booking;

                for (const empId of booking.employees) {
                    const emp = await SingleEmployee.findById(empId);
                    if (emp?.socketId) {
                        io.to(emp.socketId).emit("tool-otp-success", bookingId);
                    }
                }

            } catch (err) {
                console.error("verify-tool-otp error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });


        // ========================================================
        // PART REQUEST
        // ========================================================
        socket.on("parts-request", async ({ bookingId, employeeId, parts, totalCost }) => {
            try {
                const req = await PartRequest.create({
                    bookingId,
                    employeeId,
                    parts,
                    totalCost,
                    status: "requested",
                });

                const booking = await Booking.findById(bookingId);
                if (!booking) {
                    return socket.emit("error", { message: "Booking not found" });
                }

                const user = await User.findById(booking.user);
                if (user?.socketId) {
                    io.to(user.socketId).emit("parts-approval-request", req);
                }

            } catch (err) {
                console.error("parts-request error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });


        socket.on("approve-part-request", async ({ requestId }) => {
            try {
                const otp = Math.floor(1000 + Math.random() * 9000);

                const req = await PartRequest.findByIdAndUpdate(
                    requestId,
                    {
                        status: "approved",
                        approvalByUser: true,
                        otp,
                    },
                    { new: true }
                );

                if (!req) {
                    return socket.emit("error", { message: "Part request not found" });
                }

                const emp = await SingleEmployee.findById(req.employeeId);
                if (emp?.socketId) {
                    io.to(emp.socketId).emit("part-approved", {
                        request: req,
                        otp
                    });
                }

            } catch (err) {
                console.error("approve-part-request error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });


        socket.on("verify-part-otp", async ({ requestId, otp }) => {
            try {
                const req = await PartRequest.findById(requestId);

                if (!req) {
                    return socket.emit("error", { message: "Part request not found" });
                }

                if (req.otp !== Number(otp)) {
                    return socket.emit("part-otp-failed", { requestId });
                }

                req.status = "collected";
                req.otp = null;
                await req.save();

                const emp = await SingleEmployee.findById(req.employeeId);
                if (emp?.socketId) {
                    io.to(emp.socketId).emit("part-collected", req);
                }

            } catch (err) {
                console.error("verify-part-otp error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });



        // ========================================================
        // PAYMENT SUCCESS
        // ========================================================
        socket.on("payment-success", async ({ bookingId }) => {
            try {
                const booking = await Booking.findById(bookingId).populate("user");

                if (booking?.user?.socketId) {
                    io.to(booking.user.socketId).emit("payment-confirmed", {
                        message: "Payment successful!",
                        bookingId,
                    });
                }
            } catch (err) {
                console.error("payment-success error:", err.message);
                socket.emit("error", { message: err.message });
            }
        });



        // ========================================================
        // DISCONNECT
        // ========================================================
        socket.on("disconnect", async () => {
            try {
                await User.updateOne({ socketId: socket.id }, { socketId: null });
                await SingleEmployee.updateOne({ socketId: socket.id }, { socketId: null });
                await MultipleEmployee.updateOne({ socketId: socket.id }, { socketId: null });
                await ToolShop.updateOne({ socketId: socket.id }, { socketId: null });
            } catch (err) {
                console.error("disconnect cleanup error:", err.message);
            }

            console.log("Disconnected:", socket.id);
        });
    });
};
