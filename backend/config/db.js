const mongoose =require("mongoose");
const connectDb=async()=>{
    try{
        await mongoose.connect(process.env.MONGO_URL);
        console.log("Mongodb is connected...");
    }
    catch(err){
        console.error("Error Connecting mongodb",err);
        process.exit(1);
    }
}
module.exports=connectDb;