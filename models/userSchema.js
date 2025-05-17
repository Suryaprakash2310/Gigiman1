const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  storename: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  ownername: { type: String, required: true },
  empnum: { type: String, required: true },
  GSTnum: { type: String, required: true },
  storelocation: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);

module.exports = User;