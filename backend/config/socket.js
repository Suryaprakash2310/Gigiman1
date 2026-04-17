const { Server } = require('socket.io');
const socketHandler = require('../socket/handlers');
const AppError = require('../utils/AppError');
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const Shop = require("../models/toolshop.model");
const Admin = require("../models/admin.model");
const ROLES = require("../enum/role.enum");

const MODEL_MAP = {
    [ROLES.SINGLE_EMPLOYEE]: SingleEmployee,
    [ROLES.MULTIPLE_EMPLOYEE]: MultipleEmployee,
    [ROLES.TOOL_SHOP]: Shop,
    [ROLES.USER]: User,
    [ROLES.ADMIN]: Admin,
    [ROLES.SUPER_ADMIN]: Admin,
    [ROLES.OPERATIONS_MANAGER]: Admin,
    [ROLES.CITY_MANAGER]: Admin,
    [ROLES.SUPPORT_EXECUTIVE]: Admin
};

module.exports = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            credentials: true,
        },
        transports: ["websocket"],//Disable long-polling in productive
        pingInterval: 25000,      //How often ping is sent
        pingTimeout: 20000,      //Disconnect if no pong within 20s
        maxHttpBufferSize: 1e6,  //1MB limit(prevent abuse)
    });

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];
            if (!token || token === "null") {
                return next(new Error("Authentication error: Token missing"));
            }

            const decoded = jwt.verify(token, process.env.JWT_KEY);
            if (!decoded || !decoded.id || !decoded.role) {
                return next(new Error("Authentication error: Invalid token"));
            }

            const model = MODEL_MAP[decoded.role];
            if (!model) {
                return next(new Error("Authentication error: Invalid role"));
            }

            const identity = await model.findById(decoded.id);
            if (!identity) {
                return next(new Error("Authentication error: User not found"));
            }

            socket.role = decoded.role;
            socket.identity = identity;


            // Attach to socket
            if (decoded.role === ROLES.USER) {
                socket.userId = identity._id.toString();
            } else if (decoded.role === ROLES.SINGLE_EMPLOYEE) {
                socket.employeeId = identity._id.toString();
            } else if (decoded.role === ROLES.MULTIPLE_EMPLOYEE) {
                socket.teamId = identity._id.toString();
            } else if (decoded.role === ROLES.TOOL_SHOP) {
                socket.shopId = identity._id.toString();
            } else if ([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.OPERATIONS_MANAGER, ROLES.CITY_MANAGER, ROLES.SUPPORT_EXECUTIVE].includes(decoded.role)) {
                socket.adminId = identity._id.toString();
            }


            next();
        } catch (err) {
            next(new Error("Authentication error: " + err.message));
        }
    });

    socketHandler(io);
    return io;
}
