const PartRequest = require("../models/partsrequest.model");

exports.createPartRequest=async(req,res)=>{
    try{
        const{bookingId,employeeId,parts,totalCost}=req.body;
        const request=await PartRequest.create({
            bookingId,
            employeeId,
            parts,
            parts,
            totalCost,
            status:"required",
        });
        res.json({
            success:true,
            message:"parts required create",
            request
        });
    }
    catch(err){
        console.error("create parts request controller",err.message);
        res.status(200).json({mesage:"server error",error:err.message});
    }
}