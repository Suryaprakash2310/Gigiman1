const request = require('supertest');
const mongoose = require('mongoose');
const DomainService = require('../models/domainservice.model');

describe('Services API', () => {
    let app;
    beforeAll(async () => {
        const { app: expressApp } = require('../app');
        app = expressApp;
    });

    beforeEach(async () => {
        // Seed data before each test since afterEach clears it
        await DomainService.create([
            {
                domainName: 'Cleaning',
                serviceImage: 'cleaning.jpg'
            },
            {
                domainName: 'Plumbing',
                serviceImage: 'plumbing.jpg'
            }
        ]);
    });

    describe('GET /api/auth/services', () => {
        it('should return all services', async () => {
            const res = await request(app).get('/api/auth/services');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.count).toBe(2);
            expect(res.body.services[0]).toHaveProperty('domainName');
        });
    });

    describe('GET /api/auth/services/search', () => {
        it('should filter services by query', async () => {
            const res = await request(app).get('/api/auth/services/search?q=Clean');
            expect(res.statusCode).toBe(200);
            expect(res.body.count).toBe(1);
            expect(res.body.services[0].domainName).toBe('Cleaning');
        });

        it('should return empty list if no match', async () => {
            const res = await request(app).get('/api/auth/services/search?q=Unknown');
            expect(res.statusCode).toBe(200);
            expect(res.body.count).toBe(0);
        });
    });
});
