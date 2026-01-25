const AppError = require("../utils/AppError");

exports.allowRoles=(...roles)=>{
    return(req,res,next)=>{
        if(!req.role||!roles.includes(req.role)){
            return next(new AppError("You do not have permission to perform this action",403));
        }
        next();
    }
}