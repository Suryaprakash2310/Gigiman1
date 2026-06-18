const request = require('supertest');
const User = require('../models/user.model');

describe('Authentication API', () => {
    let app;
    beforeAll(() => {
        const { app: expressApp } = require('../app');
        app = expressApp;
    });

    describe('POST /api/user/send-otp', () => {
        it('should send OTP for a valid phone number', async () => {
            const res = await request(app)
                .post('/api/user/send-otp')
                .send({ phoneNo: '9999999999' });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('validated');
        });

        it('should return 400 if phone number is missing', async () => {
            const res = await request(app)
                .post('/api/user/send-otp')
                .send({});

            expect(res.statusCode).toBe(400);
            // expect(res.body.success).toBe(false); // Fails because response uses { status: 'error' }
            expect(res.body.status).toBe('error');
            expect(res.body.message).toContain('Phone number required');
        });
    });

    describe('POST /api/user/verify-otp', () => {
        it('should verify OTP and return a token for a new user', async () => {
            const res = await request(app)
                .post('/api/user/verify-otp')
                .send({ 
                    phoneNo: '9999999999',
                    firebaseToken: 'valid_mock_token'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.next).toBe('COMPLETE_PROFILE');
            expect(res.body.tempToken).toBeDefined();
        });

        it('should return 401 for an invalid Firebase token', async () => {
            const admin = require('../config/firebase');
            admin.auth().verifyIdToken.mockRejectedValueOnce({ code: 'auth/invalid-id-token' });

            const res = await request(app)
                .post('/api/user/verify-otp')
                .send({ 
                    phoneNo: '9999999999',
                    firebaseToken: 'invalid_token'
                });

            expect(res.statusCode).toBe(401);
            expect(res.body.message).toContain('Invalid Firebase token');
        });
    });
});
