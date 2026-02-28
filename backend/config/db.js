const mongoose = require("mongoose");
const connectDb = async () => {
    try {
        if (!process.env.MONGO_URL) {
            throw new Error("MONGO_URL is not defined in environment variables");
        }
        const conn=await mongoose.connect(process.env.MONGO_URL,{
            autoIndex:false,//Disable in production for performance
            maxPoolSize:10,//maintain up to 10 socket connections
            serverSelectionTimeoutMS:5000,//Timeout after 5s
            socketTimeoutMS:45000,
            family:4, //use of IPV4
        })
        console.log(`mongodb is connected:${conn.connection.host}`);
    }
    catch (err) {
        console.error("Error Connecting mongodb", err.message);
        process.exit(1);
    }
}
module.exports = connectDb;