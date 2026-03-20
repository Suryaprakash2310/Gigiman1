const Ticket = require("../models/ticket.model");
const TicketMessage = require("../models/ticketMessage.model");
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
        const tickets = await Ticket.find()
            .populate("raisedBy", "fullName phoneNo name email")
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
