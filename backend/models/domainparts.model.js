const mongoose=require('mongoose');

const DomainpartSchema=mongoose.Schema({
    domaintoolname:{
        type:String,
        required:true,
    },
    parts:[{
        partsname:{
            type:String,
            required:true,
        },
        price:{
            type:Number,
            required:true,
        },
        quantity:{
            type:Number,
            required:true,
        }
    }]
})

module.exports=mongoose.model('Domainparts',DomainpartSchema);