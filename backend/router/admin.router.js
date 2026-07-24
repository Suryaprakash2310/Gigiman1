const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const {
    adminLogin,
    adminVerifyOtp,
    adminSignup,
    inviteAdmin,
    getAllPermissions,
    getInviteDetails,
    checkAuth,
    getEmployeecounts,
    Adddomainservice,
    getAllEmployee,
    DeleteDomainService,
    setServiceList,
    deleteServiceCategory,
    updateServiceCategory,
    deleteServiceList,
    EditDomainService,
    getServiceCategories,
    setDomainTool,
    editDomainToolById,
    deleteDomainpartById,
    getAllBooking,
    unblockServicer,
    getAdminDashboardStats,
    getLiveBookings,
    getEmployeeCapabilities,
    blockServicer,
    exportDashboardData,
    getAllUsers,
    getAdminUserHistory,
    getAdminBookingReview,
    getFailedBookings,
    getNearbyServicersForBooking,
    adminManualNotifyServicer,
    getAllCommissionsAdmin,
    adminManualAssignBooking,
    adminUpdateBookingStatus,
    adminSendNotification,
    getRegions,
    addEmployee,
    updateEmployee,
    updateUser,
    listAdmins,
    listInvites,
    deleteInvite,
    updateAdmin,
    removeAdmin,
    getAllReviewsAdmin,
    getManagedRegions,
    addManagedRegion,
    toggleRegionBooking,
    deleteManagedRegion
} = require('../controllers/admin.controller');
const { allowRoles, hasPermission } = require('../middleware/role.middleware');
const PERMISSIONS = require('../enum/permission.enum');
const validate = require('../middleware/validation.middleware');
const bookingSchemas = require('../validations/booking.validation');
const router = express.Router();

// Login admin
router.post("/login", adminLogin);
router.post("/verify-otp", adminVerifyOtp);

// Invite admin - Restricted to those with MANAGE_ADMINS permission
router.get("/permissions", protect, hasPermission(PERMISSIONS.MANAGE_ADMINS), getAllPermissions);
router.post("/invite", protect, hasPermission(PERMISSIONS.MANAGE_ADMINS), inviteAdmin);

// Signup with invite
router.post("/signup-invite", adminSignup);

// Get invite details (public route used by signup page to fetch email/fullname/permissions)
router.get("/invite-details/:token", getInviteDetails);

// Admin Monitoring & Management
router.get("/list", protect, hasPermission(PERMISSIONS.MANAGE_ADMINS), listAdmins);
router.get("/invites", protect, hasPermission(PERMISSIONS.MANAGE_ADMINS), listInvites);
router.delete("/invite/:id", protect, hasPermission(PERMISSIONS.MANAGE_ADMINS), deleteInvite);
router.put("/update-admin/:id", protect, hasPermission(PERMISSIONS.MANAGE_ADMINS), updateAdmin);
router.delete("/remove-admin/:id", protect, hasPermission(PERMISSIONS.MANAGE_ADMINS), removeAdmin);

// Check auth
router.get("/check-auth", protect, checkAuth);

// Employee management permissions
router.get("/employee-counts", protect, hasPermission(PERMISSIONS.VIEW_EMPLOYEES), getEmployeecounts);
router.get("/get-all-employee", protect, hasPermission(PERMISSIONS.VIEW_EMPLOYEES), getAllEmployee); 4
router.get("/get-all-booking", protect, hasPermission(PERMISSIONS.MANAGE_BOOKING), getAllBooking);
router.get("/failed-bookings", protect, hasPermission(PERMISSIONS.MANAGE_BOOKING), getFailedBookings);
router.get("/nearby-servicers/:bookingId", protect, hasPermission(PERMISSIONS.MANAGE_BOOKING), getNearbyServicersForBooking);
router.post("/manual-notify", protect, hasPermission(PERMISSIONS.MANAGE_BOOKING), validate(bookingSchemas.manualNotifyServicer), adminManualNotifyServicer);

const upload = require('../middleware/upload.middleware');

// Domain Service management permissions
router.post("/add-domain-service", protect, hasPermission(PERMISSIONS.MANAGE_SERVICES), upload.single('serviceImage'), Adddomainservice);
router.post("/add-service-list", protect, hasPermission(PERMISSIONS.MANAGE_SERVICES), upload.single('servicecategoryImage'), setServiceList);
router.delete("/delete-domain-service/:id", protect, hasPermission(PERMISSIONS.MANAGE_SERVICES), DeleteDomainService);
router.put("/domainservice-edit/:DomainserviceId", protect, hasPermission(PERMISSIONS.MANAGE_SERVICES), upload.single('serviceImage'), EditDomainService);
router.put("/update-service-category/:serviceId/:categoryId", protect, hasPermission(PERMISSIONS.MANAGE_SERVICES), upload.single('servicecategoryImage'), updateServiceCategory);
router.delete("/delete-service-category/:serviceId/:categoryId", protect, hasPermission(PERMISSIONS.MANAGE_SERVICES), deleteServiceCategory);
router.delete("/delete-service-list/:serviceId", protect, hasPermission(PERMISSIONS.MANAGE_SERVICES), deleteServiceList);
router.get("/service-categories/:DomainServiceId", protect, hasPermission(PERMISSIONS.VIEW_SERVICES), getServiceCategories);

// Tool/Part management permissions
router.post("/add-domainpart", protect, hasPermission(PERMISSIONS.MANAGE_TOOLS), upload.single('domainpartimage'), setDomainTool);
router.put("/domainpart/:domainpartId", protect, hasPermission(PERMISSIONS.MANAGE_TOOLS), upload.single('domainpartimage'), editDomainToolById);
router.delete("/delete-domainpart/:domainpartId", protect, hasPermission(PERMISSIONS.MANAGE_TOOLS), deleteDomainpartById);

// Block/Unblock Servicer
router.put("/block-servicer/:id", protect, hasPermission(PERMISSIONS.MANAGE_EMPLOYEES), blockServicer);
router.put("/unblock-servicer/:id", protect, hasPermission(PERMISSIONS.MANAGE_EMPLOYEES), unblockServicer);

// Dashboard & Stats
router.get("/dashboard-stats", protect, getAdminDashboardStats);
router.get("/live-bookings", protect, hasPermission(PERMISSIONS.MANAGE_BOOKING), getLiveBookings);
router.get("/employee-capabilities", protect, hasPermission(PERMISSIONS.VIEW_EMPLOYEES), getEmployeeCapabilities);
router.get("/export-dashboard", protect, hasPermission(PERMISSIONS.SYSTEM_SETTINGS), exportDashboardData);
router.get("/get-all-users", protect, hasPermission(PERMISSIONS.VIEW_USERS), getAllUsers);
router.get("/user-history/:userId", protect, hasPermission(PERMISSIONS.VIEW_USERS), getAdminUserHistory);
router.get("/booking-review/:bookingId", protect, hasPermission(PERMISSIONS.VIEW_USERS), getAdminBookingReview);
router.get("/all-reviews", protect, hasPermission(PERMISSIONS.VIEW_USERS), getAllReviewsAdmin);

// Commission Wallet details
router.get("/commissions", protect, hasPermission(PERMISSIONS.MANAGE_FINANCE), getAllCommissionsAdmin);

// Booking assignment and status updates
router.post("/booking/assign", protect, hasPermission(PERMISSIONS.MANAGE_BOOKING), adminManualAssignBooking);
router.put("/booking/status", protect, hasPermission(PERMISSIONS.MANAGE_BOOKING), adminUpdateBookingStatus);
router.post("/notify-custom", protect, hasPermission(PERMISSIONS.SYSTEM_SETTINGS), adminSendNotification);

// Regions & Onboarding
router.get("/regions", protect, getRegions);
router.get("/regions-management", protect, getManagedRegions);
router.post("/regions-management", protect, hasPermission(PERMISSIONS.SYSTEM_SETTINGS), addManagedRegion);
router.put("/regions-management/:id", protect, hasPermission(PERMISSIONS.SYSTEM_SETTINGS), toggleRegionBooking);
router.delete("/regions-management/:id", protect, hasPermission(PERMISSIONS.SYSTEM_SETTINGS), deleteManagedRegion);

router.post("/add-employee", protect, hasPermission(PERMISSIONS.MANAGE_EMPLOYEES), addEmployee);
router.put("/update-employee/:id", protect, hasPermission(PERMISSIONS.MANAGE_EMPLOYEES), updateEmployee);
router.put("/update-user/:id", protect, hasPermission(PERMISSIONS.VIEW_USERS), updateUser);

module.exports = router;