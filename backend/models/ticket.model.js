const mongoose=require('mongoose');

const ticketSchema=new mongoose.Schema({
    raisedBy:{
        type:mongoose.Schema.Types.ObjectId,
        refPath:"raisedByModel",
    },
    raisedByModel:{
        type:String,
        enum:["User","SingleEmployee","MultipleEmployee","ToolShop"],
    },
    category:{
        type:String,
        enum:["Complaint","Query","Payment Issue","Technical Issue"],
    },
    message:{
        type:String,
        required:true,
    },
    adminReply:{
        type:String,
        default:"",
    },
    status:{
        type:String,
        enum:["Open","In progess","Resolved","Closed"],
        default:"Open",
    },
    priority:{
        type:String,
        enum:["Low","Medium","High"],
        default:"Low",
    },

},{timestamps:true});

module.exports=mongoose.model("Ticket",ticketSchema);