const mongoose=require('mongoose');
const MultipleEmployeeschema=mongoose.Schema({
    storeName:{
        type:String,
        required:true,
    },
    ownerName:{
        type:String,
        required:true,
    },
    userName:{
        type:String,
        required:true,
    },
    gstNo:{
        type:String,
        required:true,
        unique:true,
    },
    storeLocation:{
        type:String,
        required:true,
    },
    phoneNo:{
        type:Number,
        required:true,
    }
},{timestamps:true})

module.exports=mongoose.model("MultipleEmployee",MultipleEmployeeschema);