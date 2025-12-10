const {Server}=require('socket.io');
const socketHandler=require('../socket/handlers');

module.exports=(server)=>{
    const io=new Server(server,{
        cors:{origin:"*"},
        pingTimeout:60000
    });
    io.on("connection",(socket)=>{
        console.log("socket connected");
        socketHandler(io,socket);
    })
    return io;
}