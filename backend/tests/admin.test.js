const request = require('supertest');
const mongoose = require('mongoose');
const Admin = require('../models/admin.model');
const ROLES = require('../enum/role.enum');
const PERMISSIONS = require('../enum/permission.enum');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

describe('Admin API', () => {
    let app;
    let adminToken;
    let adminId;

    beforeAll(async () => {
        const { app: expressApp } = require('../app');
        app = expressApp;
    });

    beforeEach(async () => {
        // Seed an admin with all permissions before EACH test
        const admin = await Admin.create({
            fullname: 'Super Admin',
            email: 'admin@test.com',
            password: 'password123',
            role: ROLES.ADMIN,
            permissions: Object.values(PERMISSIONS),
            isApproved: true
        });
        adminId = admin._id;
        adminToken = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_KEY);
    });

    describe('POST /api/admin/login', () => {
        it('should login with correct credentials', async () => {
            const res = await request(app)
                .post('/api/admin/login')
                .send({
                    email: 'admin@test.com',
                    password: 'password123'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.token).toBeDefined();
            expect(res.body.admin.email).toBe('admin@test.com');
        });

        it('should fail with wrong password', async () => {
            const res = await request(app)
                .post('/api/admin/login')
                .send({
                    email: 'admin@test.com',
                    password: 'wrongpassword'
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toContain('Invalid password');
        });
    });

    describe('POST /api/admin/add-domain-service', () => {
        it('should create a new domain service with image', async () => {
            const dummyImagePath = path.join(__dirname, 'dummy.jpg');
            fs.writeFileSync(dummyImagePath, 'fake image data');

            const res = await request(app)
                .post('/api/admin/add-domain-service')
                .set('Authorization', `Bearer ${adminToken}`)
                .field('domainName', 'AC Repair')
                .attach('serviceImage', dummyImagePath);

            if (fs.existsSync(dummyImagePath)) fs.unlinkSync(dummyImagePath);

            expect(res.statusCode).toBe(201);
            expect(res.body.domain.domainName).toBe('AC Repair');
        });

        it('should block unauthorized users (no token)', async () => {
            const res = await request(app)
                .post('/api/admin/add-domain-service')
                .field('domainName', 'Unauthorized');

            expect(res.statusCode).toBe(401);
        });
    });

    describe('DELETE /api/admin/delete-domain-service/:id', () => {
        it('should delete an existing domain service', async () => {
            const DomainService = require('../models/domainservice.model');
            const service = await DomainService.create({
                domainName: 'To Be Deleted',
                serviceImage: 'test.jpg'
            });

            const res = await request(app)
                .delete(`/api/admin/delete-domain-service/${service._id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);

            const check = await DomainService.findById(service._id);
            expect(check).toBeNull();
        });
    });
});
