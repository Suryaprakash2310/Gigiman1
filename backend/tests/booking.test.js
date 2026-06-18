const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const ServiceList = require('../models/serviceList.model');
const DomainService = require('../models/domainservice.model');
const Booking = require('../models/Booking.model');
const jwt = require('jsonwebtoken');

describe('Booking API', () => {
    let app;
    let userToken;
    let userId;
    let serviceCategoryId;

    beforeAll(async () => {
        const { app: expressApp } = require('../app');
        app = expressApp;
    });

    beforeEach(async () => {
        // Seed user
        const user = await User.create({
            phoneNo: '+919999999999',
            fullName: 'Test User',
            isVerified: true,
            socketId: 'mock_socket_id'
        });
        userId = user._id;
        userToken = jwt.sign({ id: user._id, role: 'user' }, process.env.JWT_KEY);

        // Seed service
        const domain = await DomainService.create({
            domainName: 'Cleaning',
            serviceImage: 'cleaning.jpg'
        });

        const serviceList = await ServiceList.create({
            serviceName: 'Deep Cleaning',
            DomainServiceId: domain._id,
            serviceCategory: [{
                serviceCategoryName: 'Full House Cleaning',
                price: 1000,
                durationInMinutes: 60,
                employeeCount: 1,
                description: 'Detailed cleaning'
            }]
        });
        serviceCategoryId = serviceList.serviceCategory[0]._id;
    });

    describe('POST /api/booking/auto-assign', () => {
        it('should create a booking and return success or no-provider error', async () => {
            const res = await request(app)
                .post('/api/booking/auto-assign')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    userId: userId.toString(),
                    serviceCategoryName: 'Full House Cleaning',
                    address: '123 Test St',
                    coordinates: [77.5946, 12.9716],
                    serviceCount: 1
                });

            expect([200, 404]).toContain(res.statusCode);
            
            const booking = await Booking.findOne({ user: userId });
            expect(booking).not.toBeNull();
            expect(booking.serviceCategoryName).toBe('Full House Cleaning');
            
            // Wait slightly for background processes
            await new Promise(r => setTimeout(r, 200));
        });

        it('should fail validation if userId is missing in body', async () => {
            const res = await request(app)
                .post('/api/booking/auto-assign')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    serviceCategoryName: 'Full House Cleaning',
                    address: '123 Test St',
                    coordinates: [77.5946, 12.9716]
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toContain('"userId" is required');
        });
    });

    describe('GET /api/booking/history/user', () => {
        it('should return 404 if no bookings found', async () => {
            const res = await request(app)
                .get('/api/booking/history/user')
                .set('Authorization', `Bearer ${userToken}`);

            expect(res.statusCode).toBe(404);
            expect(res.body.message).toContain('No bookings found');
        });
    });
});
