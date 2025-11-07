const mongoose=require('mongoose');

const shopSchema=mongoose.Schema({
    shopName:{
        type:String,
        required:true,
    },
    ownerName:{
        type:String,
        required:true,
    },
    gstNo:{
        type:String,
        unique:true,
        required:true,
    },
    storeLocation:{
        type:String,
        unique:true,
        required:true,
    },
    phoneNo:{
        type:String,
        unique:true,
        required:true,
    }
},{timestamps:true})

module.exports=mongoose.model("Shop",shopSchema);