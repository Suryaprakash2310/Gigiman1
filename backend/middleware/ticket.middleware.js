const { protect } = require('./auth.middleware');
const { userProtect } = require('./user.middleware');
const ROLES=require('../enum/role.enum');
const AppError = require('../utils/AppError');

exports.ticketAuth = async (req, res, next) => {
    try {
        await userProtect(req, res, async (err) => {
            if (!err && req.user) {
                req.raisedById = req.userId;
                req.raisedByModel = "User";
                return next();
            }
            await protect(req, res, async (err2) => {
                if (!err2 && req.employee) {
                    req.raisedById = req.employeeId;

                    req.raisedByModel =
                        req.role ===ROLES.SINGLE_EMPLOYEE
                            ? "SingleEmployee"
                            : req.role === ROLES.MULTIPLE_EMPLOYEE
                                ? "MultipleEmployee"
                                : req.role === ROLES.TOOL_SHOP
                                    ? "Shop"
                                    : "Admin";

                    return next();
                }
                return next(new AppError("unauthorized to raise ticket"));
            })
        })

    }
    catch (err) {
        next(err);
    }
}