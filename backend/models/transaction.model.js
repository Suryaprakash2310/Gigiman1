const mongoose=require("mongoose");
const TRANSACTION_TYPE = require("../enum/transaction.model");
const TRANSACTION_STATUS = require("../enum/transactiontype.model");
const ROLES = require("../enum/role.model");

const transactionschema=new mongoose.Schema({
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
    amount:{
        type:Number,
        required:true,
    },
    transactionType:{
        type:String,
        enum:Object.values(TRANSACTION_TYPE),
        required:true,
    },
    transactionStatus:{
        type:String,
        enum:Object.values(TRANSACTION_STATUS),
        default:TRANSACTION_STATUS.PENDING,
    },
    razorpayOrderId:String,
    razorpayPaymentId:String,
},{timestamps:true});

module.exports=mongoose.model("Transaction",transactionschema);