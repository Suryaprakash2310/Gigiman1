const mongoose = require("mongoose");
const TRANSACTION_TYPE = require("../enum/transaction.enum");
const TRANSACTION_STATUS = require("../enum/transactiontype.enum");

const transactionschema = new mongoose.Schema({
    empId: {
        type: mongoose.Types.ObjectId,
        required: true,
        refPath: "empModel",//Dynamic reference
    },
    empType: {
        type: String,
        required: true,
    },
    empModel: {
        type: String,
        required: true,
        enum: ["SingleEmployee", "MultipleEmployee", "ToolShop"]
    },
    amount: {
        type: Number,
        required: true,
    },
    transactionType: {
        type: String,
        enum: Object.values(TRANSACTION_TYPE),
        required: true,
    },
    transactionStatus: {
        type: String,
        enum: Object.values(TRANSACTION_STATUS),
        default: TRANSACTION_STATUS.PENDING,
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
}, { timestamps: true });

module.exports = mongoose.model("Transaction", transactionschema);