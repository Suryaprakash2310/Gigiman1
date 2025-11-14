const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDb = require("./config/db");

// Routers
const singleemployee = require("./router/singleemployee.router");
const multipleemployee = require("./router/multipleempolyee.router");
const shop = require("./router/toolshop.router");
const auth = require("./router/auth.router");
const parts=require("./router/part.router");
const profile=require("./router/profile.router");

dotenv.config();
const app = express();

// ------------------- MIDDLEWARE -------------------
app.use(express.json());
app.use(cors({
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

// ------------------- DATABASE -------------------
connectDb();

// ------------------- ROUTES -------------------
app.get("/", (req, res) => res.send("API is running..."));

app.use("/api/singleemployee", singleemployee);
app.use("/api/multipleemployee", multipleemployee);
app.use("/api/toolshop", shop);
app.use("/api/auth", auth);
app.use("/api/parts",parts);
app.use("/api/profile",profile);

// ------------------- START SERVER -------------------
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
