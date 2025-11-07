const mongoose=require('mongoose');

const serviceschema=mongoose.Schema({
    serviceName:{
        type:String,
        required:true,
        trim:true,
    },
    serviceImage:{
        type:String,
        default:null,
    }
});

//fast sorting
serviceschema.index({ serviceName: 1 });


module.exports=mongoose.model("Service",serviceschema);
