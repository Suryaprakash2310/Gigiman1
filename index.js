const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const userRoutes = require('./routes/userRoutes.js');


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add cookie-parser middleware for JWT handling
app.use(cookieParser());

// Your routes
app.use('/server/users', userRoutes);
 
// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("MongoDB connection error:", err.message));

// Public route (for testing purposes)
app.get('/', (req, res) => {
  res.send('Backend is running!');
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
