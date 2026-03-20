const express = require('express');
const router = express.Router();
const {
    createTicket,
    getMyTickets,
    getTicketById,
    adminGetAllTickets,
    adminReplyTicket,
    adminUpdateStatus,
    getChatMessages,
    sendChatMessage
} = require('../controllers/ticket.controller');
const { ticketAuth } = require('../middleware/ticket.middleware');
const { protect } = require('../middleware/auth.middleware');
const { hasPermission } = require('../middleware/role.middleware');
const PERMISSIONS = require('../enum/permission.enum');

// User & Employee routes
router.post('/', ticketAuth, createTicket);
router.get('/my-tickets', ticketAuth, getMyTickets);
router.get('/:id', ticketAuth, getTicketById);
router.get('/:ticketId/messages', ticketAuth, getChatMessages);
router.post('/:ticketId/messages', ticketAuth, sendChatMessage);

// Admin routes
router.get('/admin/all', protect, adminGetAllTickets);
router.put('/admin/reply/:id', protect, adminReplyTicket);
router.put('/admin/status/:id', protect, adminUpdateStatus);

module.exports = router;
