const mongoose=require('mongoose');

const domainserviceschema=mongoose.Schema({
    domainName:{
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
domainserviceschema.index({ serviceName: 1 });


module.exports=mongoose.model("DomainService",domainserviceschema);
