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
    supportType:{
        type:String,
        enum:["Ticket","Call","Chat"],
        default:"Ticket",
    },
    category:{
        type:String,
        enum:["Complaint","Query","Payment Issue","Technical Issue", "Call Request", "Chat Request"],
    },
    message:{
        type:String,
        required:true,
    },
    bookingId:{
        type:String,
        default:"",
    },
    image:{
        type:String,
        default:"",
    },
    adminReply:{
        type:String,
        default:"",
    },
    status:{
        type:String,
        enum:["Open","In progress","Resolved","Closed"],
        default:"Open",
    },
    priority:{
        type:String,
        enum:["Low","Medium","High"],
        default:"Low",
    },

},{timestamps:true});

module.exports=mongoose.model("Ticket",ticketSchema);