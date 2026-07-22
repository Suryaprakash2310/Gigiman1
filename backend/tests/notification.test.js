const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const SingleEmployee = require('../models/singleEmployee.model');
const MultipleEmployee = require('../models/multipleEmployee.model');
const ToolShop = require('../models/toolshop.model');
const Admin = require('../models/admin.model');
const ROLES = require('../enum/role.enum');
const firebaseUtil = require('../utils/firebase.util');
const { sendNotification } = require('../utils/notification.util');

describe('Notification & FCM Integration Tests', () => {
    let app;
    let userToken, userDoc;
    let servicerToken, servicerDoc;
    let adminToken, adminDoc;

    beforeAll(() => {
        const { app: expressApp } = require('../app');
        app = expressApp;
    });

    beforeEach(async () => {
        // Create User
        userDoc = await User.create({
            fullName: 'Test User',
            phoneNo: '+919876543210',
            phoneMasked: 'XXXXXX3210',
            isVerified: true,
            role: ROLES.USER
        });
        userToken = jwt.sign({ id: userDoc._id, role: ROLES.USER }, process.env.JWT_KEY);

        // Create Servicer (SingleEmployee)
        servicerDoc = await SingleEmployee.create({
            fullname: 'Test Servicer',
            phoneNo: '+919876543211',
            phoneMasked: 'XXXXXX3211',
            address: 'Test Address',
            aadhaarNo: '123456789012',
            aadhaarMasked: 'XXXXXXXX9012',
            aadhaarHash: 'hash',
            role: ROLES.SINGLE_EMPLOYEE,
            location: { type: 'Point', coordinates: [78.7, 10.8] }
        });
        servicerToken = jwt.sign({ id: servicerDoc._id, role: ROLES.SINGLE_EMPLOYEE }, process.env.JWT_KEY);

        // Create Admin
        adminDoc = await Admin.create({
            fullname: 'Test Admin',
            email: 'admin@test.com',
            password: 'password123',
            role: ROLES.ADMIN
        });
        adminToken = jwt.sign({ id: adminDoc._id, role: ROLES.ADMIN }, process.env.JWT_KEY);
    });

    describe('FCM Token Registration Endpoints', () => {
        it('should update FCM token for user', async () => {
            const res = await request(app)
                .post('/api/notification/user/fcm-token')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ fcmToken: 'test-user-fcm-token-123' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.fcmToken).toBe('test-user-fcm-token-123');

            const updatedUser = await User.findById(userDoc._id);
            expect(updatedUser.fcmToken).toBe('test-user-fcm-token-123');
        });

        it('should update FCM token for servicer', async () => {
            const res = await request(app)
                .post('/api/notification/servicer/fcm-token')
                .set('Authorization', `Bearer ${servicerToken}`)
                .send({ fcmToken: 'test-servicer-fcm-token-456' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.fcmToken).toBe('test-servicer-fcm-token-456');

            const updatedServicer = await SingleEmployee.findById(servicerDoc._id);
            expect(updatedServicer.fcmToken).toBe('test-servicer-fcm-token-456');
        });

        it('should update FCM token for admin', async () => {
            const res = await request(app)
                .post('/api/notification/admin/fcm-token')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ fcmToken: 'test-admin-fcm-token-789' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.fcmToken).toBe('test-admin-fcm-token-789');

            const updatedAdmin = await Admin.findById(adminDoc._id);
            expect(updatedAdmin.fcmToken).toBe('test-admin-fcm-token-789');
        });
    });

    describe('sendNotification with FCM Push Dispatch', () => {
        it('should send FCM notification when recipient has an fcmToken', async () => {
            // Set token on user
            userDoc.fcmToken = 'target-user-fcm-token';
            await userDoc.save();

            const spySendFcm = jest.spyOn(firebaseUtil, 'sendFcmNotification').mockResolvedValue({ success: true });

            const notification = await sendNotification({
                userId: userDoc._id,
                title: 'Booking Confirmed',
                message: 'Your booking has been accepted.',
                type: 'BOOKING_CONFIRMED',
                data: { bookingId: 'b123' }
            });

            expect(notification).not.toBeNull();
            expect(spySendFcm).toHaveBeenCalledWith({
                fcmTokens: ['target-user-fcm-token'],
                title: 'Booking Confirmed',
                body: 'Your booking has been accepted.',
                data: {
                    bookingId: 'b123',
                    type: 'BOOKING_CONFIRMED',
                    notificationId: notification._id.toString()
                }
            });

            spySendFcm.mockRestore();
        });
    });
});
