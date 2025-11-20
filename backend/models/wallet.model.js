const mongoose = require('mongoose');
const ROLES = require('../enum/role.enum');

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
        enum: ["SingleEmployee", "MultipleEmployee", "ToolShop"]
    },
    balance: {
        type: String,
        default: 0,
    },
},
{ timestamps: true })

module.exports=mongoose.model("Wallet",walletSchema);