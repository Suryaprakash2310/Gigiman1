const mongoose=require('mongoose');

const reviewSchema=mongoose.Schema({
    booking:{
        type:mongoose.Types.ObjectId,
        ref:"Booking",
        required:true,
        unique:true,
    },
    user:{
        type:mongoose.Types.ObjectId,
        ref:"User",
        required:true,
    },
    serviceType:{
        type:String,
        enum:["single","team"],
        required:true,
    },
    primaryEmployee:{
        type:mongoose.Types.ObjectId,
        ref:"SingleEmployee",
        default:null,
    },
    helpers:[
        {
            type:mongoose.Types.ObjectId,
            ref:"MultipleEmployee",
            default:null,
        }
    ],
    company:{
        type:mongoose.Types.ObjectId,
        ref:"MultipleEmployee",
        default:null,
    },
    rating:{
        type:Number,
        min:1,
        max:5,
        required:true,
        index:true,
    },
    comment:{
        type:String,
        maxlength:500,
        trim:true,
    },
},{timestamps:true});

reviewSchema.index({ user: 1, createdAt: -1 });
reviewSchema.index({ primaryEmployee: 1 });
reviewSchema.index({ helpers: 1 });
reviewSchema.index({ company: 1 });
reviewSchema.index({ rating: -1 });


module.exports=mongoose.model("Review",reviewSchema);