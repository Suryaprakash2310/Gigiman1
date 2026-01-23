const {Server}=require('socket.io');
const socketHandler=require('../socket/handlers');

module.exports=(server)=>{
    const io=new Server(server,{
        cors:{origin:"*"},
        pingTimeout:60000
    });
     socketHandler(io);
    return io;
}