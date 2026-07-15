const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// MOCK DOTENV
jest.mock('dotenv', () => ({
    config: jest.fn()
}));

// SET ENVIRONMENT VARIABLES IMMEDIATELY
process.env.NODE_ENV = 'test';
process.env.JWT_KEY = '60a122c8e1fa3bcc0186a15554874ddb82b1225ab4e87d0ae88715b0c19fa170a2a305f0efbf667d5174935c97cb3bcb25a1fbf25d6f702ca2a69edc50654eda';
process.env.PHONE_SECRET_KEY = 'test_phone_secret';
process.env.AADHAR_KEY_SECRET = 'test_aadhar_secret';
process.env.RZ_KEY_ID = 'rzp_test_mock';
process.env.RZ_KEY_SECRET = 'mock_secret';
process.env.MAP_BOX_TOKEN = 'pk.eyJ1IjoibW9jayIsImEiOiJjbW9jayJ9.mock';
process.env.CLOUDINARY_CLOUD_NAME = 'mock_cloud';
process.env.CLOUDINARY_API_KEY = 'mock_key';
process.env.CLOUDINARY_API_SECRET = 'mock_secret';

let mongoServer;

jest.mock('@mapbox/mapbox-sdk/services/geocoding', () => {
    return jest.fn().mockReturnValue({
        forwardGeocode: jest.fn().mockReturnValue({
            send: jest.fn().mockResolvedValue({
                body: {
                    features: [{ center: [0, 0], place_name: 'Mock Address' }]
                }
            })
        }),
        reverseGeocode: jest.fn().mockReturnValue({
            send: jest.fn().mockResolvedValue({
                body: {
                    features: [{ place_name: 'Mock Address' }]
                }
            })
        })
    });
});

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGO_URL = uri;
    
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    await mongoose.connect(uri);
});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongoServer) {
        await mongoServer.stop();
    }
});

afterEach(async () => {
    if (mongoose.connection.readyState !== 0) {
        const collections = mongoose.connection.collections;
        for (const key in collections) {
            const collection = collections[key];
            await collection.deleteMany();
        }
    }
});

// Mock External Services
jest.mock('../config/firebase', () => ({
    auth: jest.fn().mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue({ phone_number: '+919999999999' })
    })
}));

jest.mock('../config/cloudinary', () => ({
    uploader: {
        upload: jest.fn().mockResolvedValue({ secure_url: 'http://mock-url.com/avatar.jpg' })
    }
}));

jest.mock('axios', () => ({
    get: jest.fn().mockResolvedValue({
        data: {
            features: [{ place_name: 'Mock Address' }]
        }
    })
}));

jest.mock('../config/whatsapp', () => jest.fn().mockResolvedValue({ success: true }));

jest.mock('../services/booking.schedule', () => ({
    startScheduler: jest.fn()
}));

jest.mock('puppeteer', () => ({
    launch: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
            setContent: jest.fn().mockResolvedValue(null),
            pdf: jest.fn().mockResolvedValue(Buffer.from('mock pdf')),
        }),
        close: jest.fn().mockResolvedValue(null)
    })
}));

jest.setTimeout(300000);

jest.mock('razorpay', () => {
    return jest.fn().mockImplementation(() => {
        return {
            orders: {
                create: jest.fn().mockResolvedValue({ id: 'order_mock_id' }),
            },
            payments: {
                fetch: jest.fn().mockResolvedValue({ status: 'captured' }),
            }
        };
    });
});
