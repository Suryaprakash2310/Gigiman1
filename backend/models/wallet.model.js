const mongoose = require('mongoose');
const ROLES = require('../enum/role.model');

const walletSchema = new mongoose.Schema({
    empId: {
        type: mongoose.Types.ObjectId,
        required: true,
        refPath: "empType",//Dynamic reference
        unique: true,
    },
    empType: {
        type: String,
        required: true,
        enum: [
            ROLES.SINGLE_EMPLOYEE,
            ROLES.MULTIPLE_EMPLOYEE,
            ROLES.TOOL_SHOP,
        ]
    },
    balance: {
        type: String,
        default: 0,
    },
},
{ timestamps: true })

model.exports=mongoose.model("Wallet",walletSchema);