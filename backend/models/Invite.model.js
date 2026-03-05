const ROLES = require('../enum/role.enum');
const mongoose=require('mongoose');
const inviteSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        default: ROLES.ADMIN,
    },
    permission: [String],
    token: String,
    expiresAt: Date,
    used: {
        type: Boolean,
        default: false,
    },
    attempts: {
        type: Number,
        default: 0,
    },
    lockedUntil: {
        type: Date
    }
}, { timeStamps: true });

module.exports = mongoose.model("Invite", inviteSchema);