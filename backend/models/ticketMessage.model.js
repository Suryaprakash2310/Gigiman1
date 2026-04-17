const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema({
    ticket: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticket",
        required: true,
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "senderModel",
        required: true,
    },
    senderModel: {
        type: String,
        enum: ["User", "SingleEmployee", "MultipleEmployee", "ToolShop", "Admin"],
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: ["text", "image", "file"],
        default: "text",
    },
    read: {
        type: Boolean,
        default: false,
    }
}, { timestamps: true });

module.exports = mongoose.model("TicketMessage", ticketMessageSchema);
