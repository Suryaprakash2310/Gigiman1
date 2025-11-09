const mongoose=require('mongoose');

const serviceListSchema=mongoose.Schema({
    DomainServiceId:{
        type:mongoose.Types.ObjectId,
        ref:"DomainService",
        required:true,
    },
    serviceName:{
        type:String,
        required:true,
    },
    description:{
        type:String,
        required:true,
    },
    price:{
        type:String,
        required:true,
    },
},{timeStamps:true})

module.exports=mongoose.model("ServiceList",serviceListSchema);