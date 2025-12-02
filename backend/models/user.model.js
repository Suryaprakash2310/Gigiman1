const mongoose=require('mongoose');

const UserSchema=mongoose.Schema({
    fullName:{
        type:String,
        required:true,
    },
    phoneNo:{
        type:String,
        required:true,
        unique:true,
    },
    phoneMasked:{
        type:String,
        required:true,
    },
    phoneHash:{
        type:String,
        required:true,
        index:true,
        unique:true,
    },
    location:{
        type:{
            type:String,
            enum:["Point"],
            default:"Point"
        },
        coordinates:{
            type:[Number],
            required:true,
        },
    },
    address:{
        type:String,
    },
    avator:{
        type:String,
        required:true,
    }
},{timestamps:true})

module.exports=mongoose.model("User",UserSchema);