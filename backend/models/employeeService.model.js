const mongoose=require('mongoose');

const EmployeeServiceSchema=mongoose.Schema({
    employeeId:{
        type:String,
        required:true,
    },
    capableservice:[{
        type:mongoose.Types.ObjectId,
        ref:"DomainService",
    }],
},{timestamps:true});

EmployeeServiceSchema.pre("save", async function (next) {
  if (this.capableservice.length > 3) {
    return next(
      new Error("Employee can only add maximum 3 services")
    );
  }
  next();
});


module.exports=mongoose.model('EmployeeService',EmployeeServiceSchema);