const express = require('express');
const {
    createScheduledNotification,
    getScheduledNotifications,
    toggleScheduledNotification,
    deleteScheduledNotification
} = require('../controllers/scheduledNotification.controller');
const { protect } = require('../middleware/auth.middleware');
const ROLES = require('../enum/role.enum');

const router = express.Router();

// Restrict to Admin roles
const restrictToAdmin = (req, res, next) => {
    const adminRoles = [
        ROLES.ADMIN, 
        ROLES.SUPER_ADMIN, 
        ROLES.OPERATIONS_MANAGER, 
        ROLES.CITY_MANAGER
    ];
    if (!adminRoles.includes(req.role)) {
        return res.status(403).json({
            success: false,
            message: "Access denied. Admin privileges required."
        });
    }
    next();
};

router.use(protect);
router.use(restrictToAdmin);

router.post('/', createScheduledNotification);
router.get('/', getScheduledNotifications);
router.patch('/:id/toggle', toggleScheduledNotification);
router.delete('/:id', deleteScheduledNotification);

module.exports = router;
