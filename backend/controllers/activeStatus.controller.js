const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ToolShop = require("../models/toolshop.model");
const roleModelMap = require("../utils/roleModelMap");
const modelMap = {
    SingleEmployee,
    MultipleEmployee,
    ToolShop
};

exports.updateActiveStatus=async(req,res)=>{
    try{
        const empId=req.employee._id;
        const empType=req.role;

        const modelName=roleModelMap[empType];
        const Model=modelMap[modelName];

        if(!Model){
            return res.status(400).json({message:"Invalid employee type"});
        }
        const{isActive}=req.body;
        
        if (typeof isActive !== "boolean"){
            return res.status(400).json({message:"isActive must be boolean"});
        }

        const emp=await Model.findByIdAndUpdate(
            empId,
            {isActive},
            {new:true},
        )
        res.json({
            message:"Actvie status updated",
            id:emp._id,
            role:empType,
            isActive:emp.isActive,
        })
    }
    catch(err){
        console.error("updateActivestatus error",err.message);
        res.status(500).json({
            message:"server error",
            error:err.message,
        })
    }
}