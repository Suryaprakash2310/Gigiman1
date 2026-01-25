module.exports=(err,req,res,next)=>{
    console.error(err);
    let statusCode=err.statusCode||500;
    let message=err.message||"Internal Server Error";

    if(err.name==="JsonWebTokenError"){
      statusCode=401;
      message="Invalid token. Please log in again.";
    }

    if(err.name==="TokenExpiredError"){
      statusCode=401;
      message="Your token has expired. Please log in again.";
    }
    if(err.code===11000){
      statusCode=400;
      message=`Duplicate field value entered: ${JSON.stringify(err.keyValue)}. Please use another value!`;
    }
    res.status(statusCode).json({
        status:"error",
        message:message,
        error:statusCode>=500?"Server Error":"Client Error",
    });
}