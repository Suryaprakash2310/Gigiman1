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
},{timestamps:true});
//  INDEXES FOR FAST SEARCH + SORTING
DomainpartSchema.index({ domaintoolname: 1 });       // Searching tool categories
DomainpartSchema.index({ "parts.partsname": 1 });    // Searching inside parts array


module.exports=mongoose.model('Domainparts',DomainpartSchema);