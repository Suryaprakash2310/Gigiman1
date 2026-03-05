const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const ROLES = require('../enum/role.enum');
const adminSchema = mongoose.Schema({
    fullname: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: Object.values(ROLES),
        default: ROLES.ADMIN
    },
    permissions: {        
        type: [String],
        default: []
    },
    isApproved: {
        type: Boolean,
        default: false
    },
    lockUntil:{
        type:Date,
    }
    
}, { timestamps: true });

adminSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
})

adminSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
}

module.exports = mongoose.model("Admin", adminSchema);