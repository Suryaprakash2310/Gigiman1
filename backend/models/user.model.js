const mongoose=require('mongoose');

const UserSchema=mongoose.Schema({
    fullName:{
        type:String,
        required:false,
    },
    phoneNo:{
        type:String,
        required:true,
        unique:false,
    },
    phoneMasked:{
        type:String,
        required:false,
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
        required:false,
    },
    isVerified:{
        type:Boolean,
        default:false,
    }
    
},{timestamps:true})

module.exports=mongoose.model("User",UserSchema);