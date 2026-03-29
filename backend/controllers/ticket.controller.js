const Ticket = require("../models/ticket.model");
const TicketMessage = require("../models/ticketMessage.model");
const User = require("../models/user.model");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ToolShop = require("../models/toolshop.model");
const AppError = require("../utils/AppError");

exports.createTicket = async (req, res, next) => {
    try {
        const { message, category, supportType, bookingId, image, priority } = req.body;
        
        if (!message) {
            return next(new AppError("Message is required", 400));
        }

        const raisedBy = req.raisedById;
        const raisedByModel = req.raisedByModel;

        if (!raisedBy || !raisedByModel) {
            return next(new AppError("User authentication failed", 401));
        }

        const ticket = await Ticket.create({
            raisedBy,
            raisedByModel,
            message,
            category: category || (supportType === 'Call' ? 'Call Request' : 'Complaint'),
            supportType: supportType || "Ticket",
            bookingId: bookingId || "",
            image: image || "",
            priority: priority || "Low",
            status: "Open"
        });

        // If it's a Chat, we might want to store the initial message in TicketMessage too
        if (supportType === "Chat") {
            await TicketMessage.create({
                ticket: ticket._id,
                sender: raisedBy,
                senderModel: raisedByModel,
                message: message
            });
        }

        res.status(201).json({
            success: true,
            ticket
        });

        // Emit socket event to admin room for real-time updates
        const io = req.app.get("io");
        if (io) {
            io.to("admin_room").emit("new-ticket", {
                ticket: await Ticket.findById(ticket._id).populate("raisedBy", "fullName phoneNo name email")
            });
        }
    } catch (err) {
        next(err);
    }
};

exports.getMyTickets = async (req, res, next) => {
    try {
        const raisedBy = req.raisedById;
        const raisedByModel = req.raisedByModel;

        const tickets = await Ticket.find({ raisedBy, raisedByModel })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            tickets
        });
    } catch (err) {
        next(err);
    }
};

exports.getTicketById = async (req, res, next) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return next(new AppError("Ticket not found", 404));
        }

        // Fetch messages if it's a chat
        let messages = [];
        if (ticket.supportType === "Chat") {
            messages = await TicketMessage.find({ ticket: ticket._id }).sort({ createdAt: 1 });
        }

        res.status(200).json({
            success: true,
            ticket,
            messages
        });
    } catch (err) {
        next(err);
    }
};

// Admin Controllers
exports.adminGetAllTickets = async (req, res, next) => {
    try {
        const { phoneNo, servicerId, type } = req.query;
        let query = {};

        if (phoneNo) {
            const user = await User.findOne({ phoneNo: phoneNo });
            if (user) {
                query.raisedBy = user._id;
                query.raisedByModel = "User";
            } else {
                // If phone number is not found for user, it could be a servicer.
                // Let's check servicers as well if no specific type is requested.
                const se = await SingleEmployee.findOne({ phoneNo: phoneNo });
                if (se) {
                    query.raisedBy = se._id;
                    query.raisedByModel = "SingleEmployee";
                } else {
                    const me = await MultipleEmployee.findOne({ phoneNo: phoneNo });
                    if (me) {
                        query.raisedBy = me._id;
                        query.raisedByModel = "MultipleEmployee";
                    } else {
                        const ts = await ToolShop.findOne({ phoneNo: phoneNo });
                        if (ts) {
                            query.raisedBy = ts._id;
                            query.raisedByModel = "ToolShop";
                        } else {
                            // If not found anywhere, return empty result or invalid query
                            return res.status(200).json({ success: true, tickets: [] });
                        }
                    }
                }
            }
        } else if (servicerId) {
            const upId = servicerId.toUpperCase();
            if (upId.startsWith("E")) {
                // Try with both 3 and 4 digit padding if user input varies
                let emp;
                if (upId.length <= 4) {
                    const num = parseInt(upId.substring(1));
                    const padded3 = `E${num.toString().padStart(3, '0')}`;
                    const padded4 = `E${num.toString().padStart(4, '0')}`;
                    emp = await SingleEmployee.findOne({ $or: [{ empId: padded3 }, { empId: padded4 }, { empId: upId }] });
                } else {
                    emp = await SingleEmployee.findOne({ empId: upId });
                }
                
                if (emp) {
                    query.raisedBy = emp._id;
                    query.raisedByModel = "SingleEmployee";
                } else {
                    return res.status(200).json({ success: true, tickets: [] });
                }
            } else if (upId.startsWith("M")) {
                let team;
                if (upId.length <= 4) {
                    const num = parseInt(upId.substring(1));
                    const padded3 = `M${num.toString().padStart(3, '0')}`;
                    const padded4 = `M${num.toString().padStart(4, '0')}`;
                    team = await MultipleEmployee.findOne({ $or: [{ TeamId: padded3 }, { TeamId: padded4 }, { TeamId: upId }] });
                } else {
                    team = await MultipleEmployee.findOne({ TeamId: upId });
                }
                
                if (team) {
                    query.raisedBy = team._id;
                    query.raisedByModel = "MultipleEmployee";
                } else {
                    return res.status(200).json({ success: true, tickets: [] });
                }
            } else if (upId.startsWith("T")) {
                let shop;
                if (upId.length <= 4) {
                    const num = parseInt(upId.substring(1));
                    const padded3 = `T${num.toString().padStart(3, '0')}`;
                    const padded4 = `T${num.toString().padStart(4, '0')}`;
                    shop = await ToolShop.findOne({ $or: [{ toolShopId: padded3 }, { toolShopId: padded4 }, { toolShopId: upId }] });
                } else {
                    shop = await ToolShop.findOne({ toolShopId: upId });
                }
                
                if (shop) {
                    query.raisedBy = shop._id;
                    query.raisedByModel = "ToolShop";
                } else {
                    return res.status(200).json({ success: true, tickets: [] });
                }
            }
        }

        if (type === "user") {
            query.raisedByModel = "User";
        } else if (type === "servicer") {
            query.raisedByModel = { $in: ["SingleEmployee", "MultipleEmployee", "ToolShop"] };
        }

        const tickets = await Ticket.find(query)
            .populate("raisedBy", "fullName fullname ownerName phoneNo name email empId TeamId toolShopId")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            tickets
        });
    } catch (err) {
        next(err);
    }
};

exports.adminReplyTicket = async (req, res, next) => {
    try {
        const { adminReply, status } = req.body;
        const ticket = await Ticket.findByIdAndUpdate(
            req.params.id,
            { 
                adminReply, 
                status: status || "In progress" 
            },
            { new: true }
        );

        if (!ticket) {
            return next(new AppError("Ticket not found", 404));
        }

        // If it's a Chat, add to message history
        if (ticket.supportType === "Chat" && adminReply) {
            await TicketMessage.create({
                ticket: ticket._id,
                sender: req.user?._id || req.userId, // Assuming admin userId from protect middleware
                senderModel: "Admin",
                message: adminReply
            });
        }

        res.status(200).json({
            success: true,
            ticket
        });
    } catch (err) {
        next(err);
    }
};

exports.adminUpdateStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const ticket = await Ticket.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );

        if (!ticket) {
            return next(new AppError("Ticket not found", 404));
        }

        res.status(200).json({
            success: true,
            ticket
        });
    } catch (err) {
        next(err);
    }
};

exports.getChatMessages = async (req, res, next) => {
    try {
        const messages = await TicketMessage.find({ ticket: req.params.ticketId }).sort({ createdAt: 1 });
        res.status(200).json({
            success: true,
            messages
        });
    } catch (err) {
        next(err);
    }
};

exports.sendChatMessage = async (req, res, next) => {
    try {
        const { message, type } = req.body;
        const ticketId = req.params.ticketId;

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            return next(new AppError("Ticket not found", 404));
        }

        const msg = await TicketMessage.create({
            ticket: ticketId,
            sender: req.raisedById || req.userId,
            senderModel: req.raisedByModel || (req.user ? "Admin" : "User"),
            message,
            type: type || "text"
        });

        res.status(201).json({
            success: true,
            message: msg
        });
    } catch (err) {
        next(err);
    }
};
