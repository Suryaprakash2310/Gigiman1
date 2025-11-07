const mongoose=require("mongoose");

const cartschema=new mongoose.Schema({
    toolname:{
        type:String,
        required:true,
        unique:true,
    },
    quality:{
        type:String,
        required:true,
    },
    amount:{
        type:Number,
        required:true,
    },
},{timestamps:true});

module.exports= mongoose.model("Cart",cartschema);
